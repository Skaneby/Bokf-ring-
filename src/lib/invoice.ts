import { db, Invoice, InvoiceRow, InvoiceMethod } from '../db';
import { formatCurrency } from './utils';

// ── Företagsinställningar ─────────────────────────────────────────────────────

export interface CompanySettings {
  name: string;
  orgnr: string;
  momsnr: string;          // SE + orgnr + 01
  address: string;
  email: string;
  phone: string;
  bankgiro: string;
  paymentTermsDays: number;
  nextInvoiceNumber: number;   // räknas bara uppåt — garanterar obruten serie
  defaultMethod: InvoiceMethod;
  template?: string;           // egen HTML-mall (importerad fil); tom = standardmall
  autoDownloadInvoice?: boolean; // ladda ned fakturafilen till datorn vid skapande
}

export const DEFAULT_COMPANY: CompanySettings = {
  name: '', orgnr: '', momsnr: '', address: '', email: '', phone: '', bankgiro: '',
  paymentTermsDays: 30,
  nextInvoiceNumber: 1,
  defaultMethod: 'faktura',
  autoDownloadInvoice: true,
};

const SETTINGS_KEY = 'company';

export async function getCompanySettings(): Promise<CompanySettings> {
  const row = await db.settings.get(SETTINGS_KEY);
  return { ...DEFAULT_COMPANY, ...(row?.value as Partial<CompanySettings> | undefined) };
}

export async function saveCompanySettings(s: CompanySettings): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: s });
}

// ── Belopp ────────────────────────────────────────────────────────────────────

// Intäktskonto per momssats (matchar standardkontoplanen)
export const REVENUE_BY_RATE: Record<number, number> = { 25: 3000, 12: 3001, 6: 3002, 0: 3040 };
export const VAT_BY_RATE: Record<number, number>     = { 25: 2610, 12: 2620, 6: 2630 };

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface VatGroup { rate: number; net: number; vat: number }

export interface InvoiceTotals {
  groups: VatGroup[];
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
}

// Radbelopp är exkl. moms; moms beräknas per momssatsgrupp (svensk praxis)
export function invoiceTotals(rows: InvoiceRow[]): InvoiceTotals {
  const byRate = new Map<number, number>();
  for (const row of rows) {
    const net = r2(row.qty * row.unitPrice);
    byRate.set(row.vatRate, r2((byRate.get(row.vatRate) ?? 0) + net));
  }
  const groups: VatGroup[] = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, net]) => ({ rate, net, vat: r2(net * rate / 100) }));

  const netTotal   = r2(groups.reduce((s, g) => s + g.net, 0));
  const vatTotal   = r2(groups.reduce((s, g) => s + g.vat, 0));
  const grossTotal = r2(netTotal + vatTotal);
  return { groups, netTotal, vatTotal, grossTotal };
}

// ── Verifikationsrader (rena funktioner — testbara) ──────────────────────────

type Line = { accountId: number; amount: number };

// Fakturametoden vid skapande: 1510 debet brutto / intäkt+moms kredit per sats
export function invoiceCreationLines(rows: InvoiceRow[]): Line[] {
  const { groups, grossTotal } = invoiceTotals(rows);
  const lines: Line[] = [{ accountId: 1510, amount: grossTotal }];
  for (const g of groups) {
    lines.push({ accountId: REVENUE_BY_RATE[g.rate], amount: -g.net });
    if (g.vat > 0) lines.push({ accountId: VAT_BY_RATE[g.rate], amount: -g.vat });
  }
  return lines;
}

// Betalning: fakturametoden flyttar fordran till bank; kontantmetoden bokför allt nu
export function invoicePaymentLines(rows: InvoiceRow[], method: InvoiceMethod): Line[] {
  const { grossTotal } = invoiceTotals(rows);
  if (method === 'faktura') {
    return [
      { accountId: 1930, amount:  grossTotal },
      { accountId: 1510, amount: -grossTotal },
    ];
  }
  const { groups } = invoiceTotals(rows);
  const lines: Line[] = [{ accountId: 1930, amount: grossTotal }];
  for (const g of groups) {
    lines.push({ accountId: REVENUE_BY_RATE[g.rate], amount: -g.net });
    if (g.vat > 0) lines.push({ accountId: VAT_BY_RATE[g.rate], amount: -g.vat });
  }
  return lines;
}

// ── Persistens ────────────────────────────────────────────────────────────────

async function bookVoucher(date: string, description: string, lines: Line[]): Promise<number> {
  const vid = await db.vouchers.add({ date, description, created_at: Date.now() });
  await db.transactions.bulkAdd(lines.map(l => ({ ...l, voucherId: vid as number })));
  return vid as number;
}

export interface NewInvoice {
  date: string;
  dueDate: string;
  customerName: string;
  customerAddress?: string;
  customerOrgnr?: string;
  customerEmail?: string;
  rows: InvoiceRow[];
  method: InvoiceMethod;
}

// Skapar fakturan, tilldelar nästa löpnummer atomiskt och bokför direkt
// om fakturametoden valts. Allt i EN transaktion — nummerserien kan inte spricka.
export async function createInvoice(data: NewInvoice): Promise<Invoice> {
  return db.transaction('rw', db.settings, db.invoices, db.vouchers, db.transactions, async () => {
    const settings = await getCompanySettings();
    const number = settings.nextInvoiceNumber;
    await saveCompanySettings({ ...settings, nextInvoiceNumber: number + 1 });

    let createdVoucherId: number | undefined;
    if (data.method === 'faktura') {
      createdVoucherId = await bookVoucher(
        data.date,
        `Faktura ${number} — ${data.customerName}`,
        invoiceCreationLines(data.rows),
      );
    }

    const invoice: Invoice = {
      ...data,
      number,
      status: 'obetald',
      createdVoucherId,
      created_at: Date.now(),
    };
    // Arkivera fakturafilen i det skick den skapades — den sparade kopian
    // påverkas aldrig av senare ändringar i uppgifter eller mall
    invoice.documentHtml = renderInvoiceHtml(invoice, settings);
    invoice.id = (await db.invoices.add(invoice)) as number;
    return invoice;
  });
}

// Arkiverad fil om den finns, annars om-rendering (fakturor skapade före arkivfunktionen)
export async function getInvoiceHtml(invoice: Invoice): Promise<string> {
  if (invoice.documentHtml) return invoice.documentHtml;
  return renderInvoiceHtml(invoice, await getCompanySettings());
}

export const invoiceFileName = (invoice: Invoice) => `faktura-${invoice.number}.html`;

export function downloadInvoiceFile(invoice: Invoice, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = invoiceFileName(invoice);
  a.click();
  URL.revokeObjectURL(url);
}

export async function registerPayment(invoiceId: number, paidDate: string): Promise<void> {
  await db.transaction('rw', db.invoices, db.vouchers, db.transactions, async () => {
    const inv = await db.invoices.get(invoiceId);
    if (!inv || inv.status !== 'obetald') throw new Error('Fakturan kan inte betalmarkeras.');
    const paidVoucherId = await bookVoucher(
      paidDate,
      `Betalning faktura ${inv.number} — ${inv.customerName}`,
      invoicePaymentLines(inv.rows, inv.method),
    );
    await db.invoices.update(invoiceId, { status: 'betald', paidDate, paidVoucherId });
  });
}

// Makulering: fakturan raderas ALDRIG (obruten serie) — status sätts och
// ev. skapande-verifikat vänds med motsatta belopp.
export async function cancelInvoice(invoiceId: number, date: string): Promise<void> {
  await db.transaction('rw', db.invoices, db.vouchers, db.transactions, async () => {
    const inv = await db.invoices.get(invoiceId);
    if (!inv || inv.status !== 'obetald') throw new Error('Endast obetalda fakturor kan makuleras.');
    if (inv.createdVoucherId) {
      const lines = await db.transactions.where('voucherId').equals(inv.createdVoucherId).toArray();
      await bookVoucher(
        date,
        `Makulering faktura ${inv.number} — ${inv.customerName}`,
        lines.map(l => ({ accountId: l.accountId, amount: -l.amount })),
      );
    }
    await db.invoices.update(invoiceId, { status: 'makulerad' });
  });
}

// ── HTML-rendering ────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Tokens som ersätts i mallen (egna mallar använder samma)
export const TEMPLATE_TOKENS = [
  'number', 'date', 'dueDate',
  'customerName', 'customerAddress', 'customerOrgnr',
  'companyName', 'companyOrgnr', 'companyMomsnr', 'companyAddress',
  'companyEmail', 'companyPhone', 'bankgiro',
  'rows', 'vatBreakdown', 'netTotal', 'vatTotal', 'grossTotal',
] as const;

export const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Faktura {{number}}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 40px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .muted { color: #64748b; font-size: 13px; }
  .head { display: flex; justify-content: space-between; margin-bottom: 32px; }
  .meta td { padding: 2px 12px 2px 0; font-size: 14px; }
  table.rows { width: 100%; border-collapse: collapse; margin: 24px 0; }
  table.rows th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
                  color: #64748b; border-bottom: 2px solid #0f172a; padding: 6px 8px; }
  table.rows th.num, table.rows td.num { text-align: right; }
  table.rows td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  .totals { margin-left: auto; width: 280px; font-size: 14px; }
  .totals td { padding: 4px 8px; }
  .totals .grand { font-weight: 700; font-size: 18px; border-top: 2px solid #0f172a; }
  .foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0;
          font-size: 12px; color: #64748b; display: flex; gap: 32px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>Faktura</h1>
      <div class="muted">{{companyName}}</div>
    </div>
    <table class="meta">
      <tr><td class="muted">Fakturanr</td><td><strong>{{number}}</strong></td></tr>
      <tr><td class="muted">Fakturadatum</td><td>{{date}}</td></tr>
      <tr><td class="muted">Förfallodatum</td><td><strong>{{dueDate}}</strong></td></tr>
    </table>
  </div>

  <div class="head">
    <div>
      <div class="muted" style="text-transform:uppercase;font-size:11px;letter-spacing:.05em">Faktureras till</div>
      <div><strong>{{customerName}}</strong></div>
      <div style="white-space:pre-line">{{customerAddress}}</div>
      <div class="muted">{{customerOrgnr}}</div>
    </div>
  </div>

  <table class="rows">
    <thead>
      <tr><th>Beskrivning</th><th class="num">Antal</th><th class="num">À-pris</th><th class="num">Moms</th><th class="num">Belopp</th></tr>
    </thead>
    <tbody>
      {{rows}}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Netto</td><td class="num" style="text-align:right">{{netTotal}}</td></tr>
    {{vatBreakdown}}
    <tr class="grand"><td>Att betala</td><td class="num" style="text-align:right">{{grossTotal}}</td></tr>
  </table>

  <div class="foot">
    <div><strong>{{companyName}}</strong><br>{{companyAddress}}<br>Org.nr {{companyOrgnr}}<br>Momsreg.nr {{companyMomsnr}}</div>
    <div>Bankgiro: <strong>{{bankgiro}}</strong><br>{{companyEmail}}<br>{{companyPhone}}</div>
    <div>Godkänd för F-skatt.<br>Betalningsvillkor: se förfallodatum.<br>Ange fakturanummer vid betalning.</div>
  </div>
</body>
</html>`;

export function renderInvoiceHtml(invoice: Invoice, company: CompanySettings): string {
  const totals = invoiceTotals(invoice.rows);

  const rowsHtml = invoice.rows.map(row => {
    const net = r2(row.qty * row.unitPrice);
    return `<tr><td>${esc(row.description)}</td><td class="num">${row.qty}</td>` +
      `<td class="num">${formatCurrency(row.unitPrice)}</td>` +
      `<td class="num">${row.vatRate} %</td>` +
      `<td class="num">${formatCurrency(net)}</td></tr>`;
  }).join('\n');

  const vatHtml = totals.groups
    .filter(g => g.vat > 0)
    .map(g => `<tr><td>Moms ${g.rate} %</td><td class="num" style="text-align:right">${formatCurrency(g.vat)}</td></tr>`)
    .join('\n');

  const values: Record<string, string> = {
    number:          String(invoice.number),
    date:            invoice.date,
    dueDate:         invoice.dueDate,
    customerName:    esc(invoice.customerName),
    customerAddress: esc(invoice.customerAddress ?? ''),
    customerOrgnr:   invoice.customerOrgnr ? `Org.nr ${esc(invoice.customerOrgnr)}` : '',
    companyName:     esc(company.name),
    companyOrgnr:    esc(company.orgnr),
    companyMomsnr:   esc(company.momsnr),
    companyAddress:  esc(company.address),
    companyEmail:    esc(company.email),
    companyPhone:    esc(company.phone),
    bankgiro:        esc(company.bankgiro),
    rows:            rowsHtml,
    vatBreakdown:    vatHtml,
    netTotal:        formatCurrency(totals.netTotal),
    vatTotal:        formatCurrency(totals.vatTotal),
    grossTotal:      formatCurrency(totals.grossTotal),
  };

  const template = company.template?.trim() ? company.template : DEFAULT_TEMPLATE;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}
