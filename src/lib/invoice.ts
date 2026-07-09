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
  contactPerson?: string;  // "Vår referens" / avsändarens kontaktperson
  bankName?: string;       // t.ex. Nordea
  iban?: string;           // för utländska betalningar
  approvedForFskatt?: boolean; // visar "Godkänd för F-skatt" (default på)
  paymentTermsDays: number;
  nextInvoiceNumber: number;   // räknas bara uppåt — garanterar obruten serie
  defaultMethod: InvoiceMethod;
  template?: string;           // egen HTML-mall (importerad fil); tom = standardmall
  autoDownloadInvoice?: boolean; // ladda ned fakturafilen till datorn vid skapande
}

export const DEFAULT_COMPANY: CompanySettings = {
  name: '', orgnr: '', momsnr: '', address: '', email: '', phone: '', bankgiro: '',
  contactPerson: '', bankName: '', iban: '', approvedForFskatt: true,
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
  customerReference?: string;
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

// Belopp i tabellen utan valutasymbol (design visar "12 500,00", totaler "… kr")
const fmt2 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tokens som ersätts i mallen. Kopplingarna mellan fakturans/bokföringens
// data och mallen sker HÄR — därför redigerar användaren mallen i appen
// (ingen HTML-import) så att alla {{tokens}} garanterat finns kvar.
export const TEMPLATE_TOKENS = [
  'number', 'date', 'dueDate', 'statusBadge',
  'customerName', 'customerAddress', 'customerOrgnr', 'customerReference',
  'companyName', 'companyContact', 'companyOrgnr', 'companyMomsnr', 'companyAddress',
  'companyEmail', 'companyPhone', 'bankgiro', 'bankName', 'iban', 'fskatt',
  'rows', 'vatBreakdown', 'netTotal', 'vatTotal', 'grossTotal',
] as const;

export type TemplateToken = typeof TEMPLATE_TOKENS[number];

// Kritiska kopplingar — utan dessa är dokumentet inte en giltig faktura.
// Att spara en mall utan dem BLOCKERAS.
export const REQUIRED_TOKENS: { token: TemplateToken; label: string }[] = [
  { token: 'number',     label: 'Fakturanummer' },
  { token: 'date',       label: 'Fakturadatum' },
  { token: 'customerName', label: 'Kundens namn' },
  { token: 'rows',       label: 'Fakturarader' },
  { token: 'grossTotal', label: 'Att betala (totalsumma)' },
  { token: 'companyName', label: 'Företagsnamn' },
];

// Rekommenderade kopplingar — krävs på en korrekt svensk faktura men
// blockerar inte (t.ex. ej momsregistrerad firma saknar momsnr). VARNAS.
export const RECOMMENDED_TOKENS: { token: TemplateToken; label: string }[] = [
  { token: 'dueDate',      label: 'Förfallodatum' },
  { token: 'vatBreakdown', label: 'Momsspecifikation' },
  { token: 'netTotal',     label: 'Nettobelopp' },
  { token: 'companyOrgnr', label: 'Organisationsnummer' },
  { token: 'companyMomsnr', label: 'Momsregistreringsnummer' },
  { token: 'companyAddress', label: 'Företagets adress' },
];

export interface TemplateValidation {
  missingRequired: { token: TemplateToken; label: string }[];
  missingRecommended: { token: TemplateToken; label: string }[];
  ok: boolean; // true om inga kritiska kopplingar saknas
}

// Kontrollerar att en (redigerad) mall behåller sina kopplingar.
export function validateTemplate(html: string): TemplateValidation {
  const has = (t: string) => new RegExp(`\\{\\{\\s*${t}\\s*\\}\\}`).test(html);
  const missingRequired = REQUIRED_TOKENS.filter(r => !has(r.token));
  const missingRecommended = RECOMMENDED_TOKENS.filter(r => !has(r.token));
  return { missingRequired, missingRecommended, ok: missingRequired.length === 0 };
}

// Standardmall — självständig (inline CSS, inga externa beroenden) så att den
// arkiverade fakturafilen renderas korrekt även offline långt senare.
export const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Faktura {{number}}</title>
<style>
  :root { --navy:#0F172A; --teal:#0D9488; --line:#E2E8F0; --muted:#76777d; --soft:#45464d; }
  * { box-sizing: border-box; }
  body { font-family: 'Manrope','Inter',-apple-system,'Segoe UI',Roboto,sans-serif;
         color: var(--navy); background:#f8f9ff; margin:0; padding:32px 16px; }
  .sheet { background:#fff; max-width:800px; margin:0 auto; padding:56px;
           border:1px solid var(--line); box-shadow:0 10px 30px rgba(15,23,42,.08); }
  .mono { font-family:'JetBrains Mono',ui-monospace,monospace; }
  .row { display:flex; justify-content:space-between; align-items:flex-start; }
  .label { font-size:12px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
  .teal { color:var(--teal); }
  h1 { font-size:34px; font-weight:800; letter-spacing:-.02em; margin:0; }
  .sender { text-align:right; font-size:14px; line-height:1.55; }
  .billing { display:grid; grid-template-columns:1fr 1fr; gap:24px;
             border-top:1px solid var(--line); border-bottom:1px solid var(--line);
             padding:28px 0; margin:44px 0; }
  .meta { text-align:right; font-size:13px; line-height:2; }
  .meta .k { color:var(--muted); text-transform:uppercase; font-size:11px; letter-spacing:.05em; margin-right:12px; }
  .badge { display:inline-block; margin-top:10px; padding:4px 12px; border-radius:999px;
           font-size:11px; letter-spacing:.05em; text-transform:uppercase; font-weight:600; }
  .badge.obetald { background:#fef3c7; color:#92400e; }
  .badge.betald { background:rgba(16,185,129,.1); color:#047857; border:1px solid rgba(16,185,129,.2); }
  .badge.makulerad { background:#f1f5f9; color:#64748b; }
  table.items { width:100%; border-collapse:separate; border-spacing:0; }
  table.items thead th { background:var(--navy); color:#fff; text-align:left; font-size:11px;
    letter-spacing:.05em; text-transform:uppercase; padding:12px 20px; font-weight:600; }
  table.items thead th:first-child { border-radius:6px 0 0 6px; }
  table.items thead th:last-child { border-radius:0 6px 6px 0; }
  table.items thead th.num, table.items td.num { text-align:right; }
  table.items td { padding:18px 20px; border-bottom:1px solid var(--line); font-size:15px; }
  table.items td .desc { color:var(--muted); font-size:13px; margin-top:2px; }
  .totals { margin:36px 0 0 auto; width:300px; font-size:15px; }
  .totals .t { display:flex; justify-content:space-between; padding:6px 0; }
  .totals .t .muted { color:var(--muted); }
  .totals .grand { display:flex; justify-content:space-between; align-items:baseline;
    margin-top:10px; padding-top:16px; border-top:1px solid var(--line); }
  .totals .grand .lbl { font-size:22px; font-weight:700; }
  .totals .grand .amt { font-size:22px; font-weight:700; color:var(--teal); }
  .foot { display:grid; grid-template-columns:1fr 1fr 1fr; gap:32px;
          margin-top:56px; padding-top:28px; border-top:1px solid var(--line); }
  .foot h3 { font-size:11px; letter-spacing:.05em; text-transform:uppercase; margin:0 0 10px; }
  .foot .kv { font-size:12px; color:var(--soft); line-height:1.9; }
  .foot .kv p { display:flex; justify-content:space-between; margin:0; gap:12px; }
  .foot .kv .k { color:var(--muted); }
  .thanks { font-size:11px; color:var(--muted); font-style:italic; margin-top:16px; text-align:right; line-height:1.5; }
  @media print { body { background:#fff; padding:0; } .sheet { box-shadow:none; border:none; padding:16mm; max-width:none; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="row">
      <div>
        <h1>FAKTURA</h1>
        <div style="margin-top:14px"><span class="label">Fakturanummer:</span>
          <span class="mono" style="font-weight:600">{{number}}</span></div>
      </div>
      <div class="sender">
        <div class="label teal" style="font-weight:700;margin-bottom:6px">Sändare</div>
        <div style="font-weight:700">{{companyName}}</div>
        {{companyContact}}
        <div style="white-space:pre-line">{{companyAddress}}</div>
        <div style="margin-top:6px">{{companyPhone}}</div>
        <div>{{companyEmail}}</div>
      </div>
    </div>

    <div class="billing">
      <div>
        <div class="label" style="color:var(--navy);font-weight:700;margin-bottom:12px">Faktureras till</div>
        <div style="font-weight:700">{{customerName}}</div>
        <div style="white-space:pre-line;line-height:1.55">{{customerAddress}}</div>
        <div style="color:var(--muted);margin-top:2px">{{customerOrgnr}}</div>
      </div>
      <div class="meta">
        {{customerReference}}
        <div><span class="k">Fakturadatum:</span>{{date}}</div>
        <div><span class="k">Förfallodatum:</span><strong>{{dueDate}}</strong></div>
        <div>{{statusBadge}}</div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr><th>Beskrivning</th><th class="num">Antal</th><th class="num">Pris</th><th class="num">Belopp</th></tr>
      </thead>
      <tbody>
        {{rows}}
      </tbody>
    </table>

    <div class="totals">
      <div class="t"><span class="muted">Netto (exkl. moms)</span><span>{{netTotal}}</span></div>
      {{vatBreakdown}}
      <div class="grand"><span class="lbl">ATT BETALA</span><span class="amt">{{grossTotal}}</span></div>
    </div>

    <div class="foot">
      <div>
        <h3>Betalningsinformation</h3>
        <div class="kv">
          {{bankgiro}}
          {{bankName}}
          {{iban}}
        </div>
      </div>
      <div>
        <h3>Företagsinfo</h3>
        <div class="kv">
          <p><span class="k">Org.nr:</span> <span>{{companyOrgnr}}</span></p>
          <p><span class="k">Momsreg.nr:</span> <span>{{companyMomsnr}}</span></p>
          {{fskatt}}
        </div>
      </div>
      <div style="text-align:right">
        <h3>Adress</h3>
        <div class="kv" style="white-space:pre-line">{{companyAddress}}</div>
        <div class="thanks">Tack för förtroendet.<br>Betalning oss tillhanda senast förfallodagen.<br>Ange fakturanummer {{number}} vid betalning.</div>
      </div>
    </div>
  </div>
</body>
</html>`;

const STATUS_LABEL: Record<Invoice['status'], string> = {
  obetald: 'Obetald', betald: 'Betald', makulerad: 'Makulerad',
};

export function renderInvoiceHtml(invoice: Invoice, company: CompanySettings): string {
  const totals = invoiceTotals(invoice.rows);

  const rowsHtml = invoice.rows.map(row => {
    const net = r2(row.qty * row.unitPrice);
    return `<tr><td><span style="font-weight:600">${esc(row.description)}</span></td>` +
      `<td class="num">${row.qty}</td>` +
      `<td class="num">${fmt2.format(row.unitPrice)}</td>` +
      `<td class="num" style="font-weight:600">${fmt2.format(net)}</td></tr>`;
  }).join('\n');

  const vatHtml = totals.groups
    .filter(g => g.vat > 0)
    .map(g => `<div class="t"><span class="muted">Moms ${g.rate} %</span><span>${formatCurrency(g.vat)}</span></div>`)
    .join('\n');

  // Rader/fält som bara ska visas när de har innehåll (inga tomma etiketter)
  const kvLine = (k: string, v: string) => v ? `<p><span class="k">${k}:</span> <span style="font-weight:500">${esc(v)}</span></p>` : '';
  const metaRow = (k: string, v: string) => v ? `<div><span class="k">${k}:</span>${esc(v)}</div>` : '';

  const values: Record<string, string> = {
    number:          String(invoice.number),
    date:            invoice.date,
    dueDate:         invoice.dueDate,
    statusBadge:     `<span class="badge ${invoice.status}">${STATUS_LABEL[invoice.status]}</span>`,
    customerName:    esc(invoice.customerName),
    customerAddress: esc(invoice.customerAddress ?? ''),
    customerOrgnr:   invoice.customerOrgnr ? `Org.nr ${esc(invoice.customerOrgnr)}` : '',
    customerReference: metaRow('Er referens', invoice.customerReference ?? ''),
    companyName:     esc(company.name),
    companyContact:  company.contactPerson ? `<div>${esc(company.contactPerson)}</div>` : '',
    companyOrgnr:    esc(company.orgnr),
    companyMomsnr:   esc(company.momsnr),
    companyAddress:  esc(company.address),
    companyEmail:    esc(company.email),
    companyPhone:    esc(company.phone),
    bankgiro:        kvLine('Bankgiro', company.bankgiro),
    bankName:        kvLine('Bank', company.bankName ?? ''),
    iban:            kvLine('IBAN', company.iban ?? ''),
    fskatt:          company.approvedForFskatt !== false
                       ? '<p class="teal" style="font-weight:700;text-transform:uppercase;font-size:10px;margin-top:4px">Godkänd för F-skatt</p>'
                       : '',
    rows:            rowsHtml,
    vatBreakdown:    vatHtml,
    netTotal:        formatCurrency(totals.netTotal),
    vatTotal:        formatCurrency(totals.vatTotal),
    grossTotal:      formatCurrency(totals.grossTotal),
  };

  const template = company.template?.trim() ? company.template : DEFAULT_TEMPLATE;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}
