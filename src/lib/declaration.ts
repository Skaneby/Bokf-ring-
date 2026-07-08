// Spår 0 — blankettvy NE (SKV 2161) för manuell deklaration.
// Bygger blankettrader från bokföringen + manuella justeringar.
// Se docs/deklarationsmodul-spec.md §8 (mappning) och §13 (UX).
//
// OBS: kontomappningen per R-rad är en FÖRENKLAD standardmappning märkt
// VERIFIERAS — den täcker appens standardkontoplan. Varje rad kan justeras
// manuellt, och justeringen vinner alltid över det bokförda värdet.
// SRU-fältkoder per rad fylls i vid M2 efter verifiering mot Skatteverket.

import { db, Declaration, DeclarationField, DeclarationSubmission, DeclarationType, Voucher, Transaction } from '../db';

// ── Blankettdefinition ────────────────────────────────────────────────────────

export type NeLineKind =
  | 'revenue'   // intäktsrad (årets transaktioner): visas positivt från kreditsaldo
  | 'expense'   // kostnadsrad (årets transaktioner): visas positivt från debetsaldo
  | 'asset'     // balanspost (ackumulerat t.o.m. året): debetsaldo positivt
  | 'liability' // balanspost (ackumulerat): kreditsaldo positivt (EK/skulder)
  | 'manual'    // ingår i beräkningen men saknar automappning (anges för hand)
  | 'computed'; // summarad — kan inte justeras

export interface NeLineDef {
  id: string;
  label: string;
  kind: NeLineKind;
  accounts?: { from: number; to: number }[]; // förenklade intervall enligt BAS kopplingstabell
  sruCode?: string; // VERIFIERAD fältkod ur BAS kopplingstabell NE (förenklat årsbokslut)
}

// Fältkoder och kontointervall enligt BAS kopplingstabell "NE — Inkomst av
// näringsverksamhet, Enskilda näringsidkare (förenklat årsbokslut)".
// Justeringsraderna R12+ ingår inte i kopplingstabellen och saknar därför
// verifierad fältkod (exporteras inte i SRU-filen — kompletteras i e-tjänsten).
export const NE_LINES: NeLineDef[] = [
  // ── Balansräkning (B) — värderas per bokslutsdagen ──
  { id: 'B1',  label: 'Immateriella anläggningstillgångar', kind: 'asset', sruCode: '7200',
    accounts: [{ from: 1000, to: 1099 }] },
  { id: 'B2',  label: 'Byggnader och markanläggningar', kind: 'asset', sruCode: '7210',
    accounts: [{ from: 1100, to: 1129 }, { from: 1140, to: 1179 }, { from: 1190, to: 1199 }] },
  { id: 'B3',  label: 'Mark och andra tillgångar som inte får skrivas av', kind: 'asset', sruCode: '7211',
    accounts: [{ from: 1130, to: 1139 }, { from: 1180, to: 1189 }] },
  { id: 'B4',  label: 'Maskiner och inventarier', kind: 'asset', sruCode: '7212',
    accounts: [{ from: 1200, to: 1299 }] },
  { id: 'B5',  label: 'Övriga anläggningstillgångar', kind: 'asset', sruCode: '7213',
    accounts: [{ from: 1300, to: 1399 }] },
  { id: 'B6',  label: 'Varulager', kind: 'asset', sruCode: '7240',
    accounts: [{ from: 1400, to: 1499 }] },
  { id: 'B7',  label: 'Kundfordringar', kind: 'asset', sruCode: '7250',
    accounts: [{ from: 1500, to: 1599 }] },
  { id: 'B8',  label: 'Övriga fordringar', kind: 'asset', sruCode: '7260',
    accounts: [{ from: 1600, to: 1799 }] },
  { id: 'B9',  label: 'Kassa och bank', kind: 'asset', sruCode: '7280',
    accounts: [{ from: 1900, to: 1999 }] },
  { id: 'B10', label: 'Eget kapital', kind: 'liability', sruCode: '7300',
    accounts: [{ from: 2000, to: 2099 }] },
  { id: 'B13', label: 'Låneskulder', kind: 'liability', sruCode: '7380',
    accounts: [{ from: 2300, to: 2399 }] },
  { id: 'B14', label: 'Skatteskulder (inkl. moms)', kind: 'liability', sruCode: '7381',
    accounts: [{ from: 2500, to: 2799 }] },
  { id: 'B15', label: 'Leverantörsskulder', kind: 'liability', sruCode: '7382',
    accounts: [{ from: 2440, to: 2449 }] },
  { id: 'B16', label: 'Övriga skulder', kind: 'liability', sruCode: '7383',
    accounts: [{ from: 2400, to: 2439 }, { from: 2450, to: 2499 }, { from: 2800, to: 2999 }] },
  // ── Resultaträkning (R) — årets transaktioner ──
  { id: 'R1',  label: 'Försäljning och utfört arbete samt övriga momspliktiga intäkter',
    kind: 'revenue', sruCode: '7400', accounts: [{ from: 3000, to: 3039 }, { from: 3041, to: 3799 }] },
  { id: 'R2',  label: 'Momsfria intäkter',
    kind: 'revenue', sruCode: '7401', accounts: [{ from: 3040, to: 3040 }, { from: 3800, to: 3999 }] },
  { id: 'R3',  label: 'Bil- och bostadsförmån m.m.', kind: 'manual', sruCode: '7402' },
  { id: 'R4',  label: 'Ränteintäkter m.m.',
    kind: 'revenue', sruCode: '7403', accounts: [{ from: 8000, to: 8399 }] },
  { id: 'R5',  label: 'Varor, material och tjänster',
    kind: 'expense', sruCode: '7500', accounts: [{ from: 4000, to: 4999 }] },
  { id: 'R6',  label: 'Övriga externa kostnader',
    kind: 'expense', sruCode: '7501', accounts: [{ from: 5000, to: 6999 }] },
  { id: 'R7',  label: 'Anställd personal',
    kind: 'expense', sruCode: '7502', accounts: [{ from: 7000, to: 7699 }] },
  { id: 'R8',  label: 'Räntekostnader m.m.',
    kind: 'expense', sruCode: '7503', accounts: [{ from: 8400, to: 8421 }, { from: 8423, to: 8799 }] },
  { id: 'R9',  label: 'Avskrivningar och nedskrivningar byggnader och markanläggningar',
    kind: 'expense', sruCode: '7504', accounts: [{ from: 7820, to: 7829 }] },
  { id: 'R10', label: 'Avskrivningar och nedskrivningar maskiner/inventarier och immateriella tillgångar',
    kind: 'expense', sruCode: '7505', accounts: [{ from: 7800, to: 7819 }, { from: 7830, to: 7899 }] },
  { id: 'R11', label: 'Bokfört resultat', kind: 'computed', sruCode: '7440' },
  // ── Skattemässiga justeringar (radnummer enligt blankett SKV 2161 utgåva 13) ──
  // R12 = överföring av R11 till sidan 2 (visas inte som egen rad här).
  // Fältkoder ej i kopplingstabellen → exporteras ej, kompletteras i e-tjänsten.
  { id: 'R13', label: 'Bokförda kostnader som inte ska dras av', kind: 'manual' },
  { id: 'R14', label: 'Bokförda intäkter som inte ska tas upp', kind: 'manual' },
  // Egenavgifter: avsättningen bokförs på 8422 i appen och redovisas här som
  // årets beräknade avdrag. Schablonavdrag 25 % kan justeras manuellt på raden.
  { id: 'R43', label: 'Årets beräknade avdrag för egenavgifter och särskild löneskatt (konto 8422)',
    kind: 'expense', accounts: [{ from: 8422, to: 8422 }] },
  { id: 'R47', label: 'Överskott → INK1 p. 10.1 eller 10.3', kind: 'computed' },
  { id: 'R48', label: 'Underskott → INK1 p. 10.2 eller 10.4', kind: 'computed' },
];

// ── Radbygge ──────────────────────────────────────────────────────────────────

export interface NeRow {
  id: string;
  label: string;
  kind: NeLineKind;
  auto: number;      // bokfört värde (hela kronor)
  value: number;     // gällande värde (justerat om adjusted)
  adjusted: boolean;
  note?: string;
  sruCode?: string;
}

export type NeAdjustments = Record<string, DeclarationField>;

const REVENUE_LINES = ['R1', 'R2', 'R3', 'R4'];
const EXPENSE_LINES = ['R5', 'R6', 'R7', 'R8', 'R9', 'R10'];

export function taxYearsAvailable(vouchers: Voucher[]): number[] {
  const years = new Set(vouchers.map(v => parseInt(v.date.slice(0, 4), 10)));
  return [...years].filter(y => !Number.isNaN(y)).sort((a, b) => b - a);
}

// Bygger NE-raderna för ett beskattningsår. Justeringar (adjustments) vinner
// över bokförda värden; summarader räknas alltid om från gällande värden.
export function buildNeRows(
  vouchers: Voucher[],
  transactions: Transaction[],
  taxYear: number,
  adjustments: NeAdjustments = {},
): NeRow[] {
  const voucherYear = new Map(vouchers.map(v => [v.id!, parseInt(v.date.slice(0, 4), 10)]));

  // Resultatrader (R) avser årets transaktioner; balansposter (B) värderas
  // per bokslutsdagen = ackumulerat saldo t.o.m. beskattningsåret
  const balYear = new Map<number, number>();
  const balCum  = new Map<number, number>();
  for (const t of transactions) {
    const year = voucherYear.get(t.voucherId);
    if (year === undefined || year > taxYear) continue;
    balCum.set(t.accountId, (balCum.get(t.accountId) ?? 0) + t.amount);
    if (year === taxYear) balYear.set(t.accountId, (balYear.get(t.accountId) ?? 0) + t.amount);
  }

  const sumRanges = (map: Map<number, number>, ranges: { from: number; to: number }[]): number => {
    let total = 0;
    for (const [accountId, saldo] of map) {
      if (ranges.some(r => accountId >= r.from && accountId <= r.to)) total += saldo;
    }
    return total;
  };

  // Steg 1: leaf-rader (auto + ev. justering)
  const rows: NeRow[] = NE_LINES.map(def => {
    let auto = 0;
    if (def.accounts) {
      const isBalance = def.kind === 'asset' || def.kind === 'liability';
      const saldo = sumRanges(isBalance ? balCum : balYear, def.accounts);
      const creditPositive = def.kind === 'revenue' || def.kind === 'liability';
      auto = Math.round(creditPositive ? -saldo : saldo); // hela kronor
    }
    const adj = adjustments[def.id];
    return {
      id: def.id, label: def.label, kind: def.kind, sruCode: def.sruCode,
      auto,
      value: def.kind === 'computed' ? 0 : (adj ? Math.round(adj.value) : auto),
      adjusted: def.kind !== 'computed' && adj !== undefined,
      note: adj?.note,
    };
  });

  // Steg 2: summarader från gällande värden
  const get = (id: string) => rows.find(r => r.id === id)!;
  const sumOf = (ids: string[]) => ids.reduce((s, id) => s + get(id).value, 0);

  const r11 = sumOf(REVENUE_LINES) - sumOf(EXPENSE_LINES);
  get('R11').value = r11;
  get('R11').auto  = r11;

  const slutligt = r11 + get('R13').value - get('R14').value - get('R43').value;
  get('R47').value = Math.max(0, slutligt);
  get('R47').auto  = get('R47').value;
  get('R48').value = Math.max(0, -slutligt);
  get('R48').auto  = get('R48').value;

  return rows;
}

// ── Persistens ────────────────────────────────────────────────────────────────

export async function getDeclaration(
  taxYear: number,
  type: DeclarationType = 'NE',
): Promise<Declaration | undefined> {
  return db.declarations.where('taxYear').equals(taxYear).filter(d => d.type === type).first();
}

export async function saveAdjustment(
  taxYear: number,
  lineId: string,
  field: DeclarationField | null, // null = återställ till bokfört
  type: DeclarationType = 'NE',
): Promise<void> {
  await db.transaction('rw', db.declarations, async () => {
    const existing = await getDeclaration(taxYear, type);
    const fields = { ...(existing?.fields ?? {}) };
    if (field === null) delete fields[lineId];
    else fields[lineId] = field;
    if (existing) {
      await db.declarations.update(existing.id!, { fields, updated_at: Date.now() });
    } else {
      await db.declarations.add({ taxYear, type, fields, status: 'draft', updated_at: Date.now() });
    }
  });
}

export async function setDeclarationStatus(
  taxYear: number,
  status: 'draft' | 'klar',
  type: DeclarationType = 'NE',
): Promise<void> {
  await db.transaction('rw', db.declarations, async () => {
    const existing = await getDeclaration(taxYear, type);
    if (existing) {
      await db.declarations.update(existing.id!, { status, updated_at: Date.now() });
    } else {
      await db.declarations.add({ taxYear, type, fields: {}, status, updated_at: Date.now() });
    }
  });
}

// Bekräfta ett inlämningssteg (exporterad/uppladdad/signerad). null = ångra steget.
export async function setSubmissionStep(
  taxYear: number,
  step: keyof DeclarationSubmission,
  timestamp: string | null,
  type: DeclarationType = 'NE',
): Promise<void> {
  await db.transaction('rw', db.declarations, async () => {
    const existing = await getDeclaration(taxYear, type);
    const submission = { ...(existing?.submission ?? {}) };
    if (timestamp === null) delete submission[step];
    else submission[step] = timestamp;
    if (existing) {
      await db.declarations.update(existing.id!, { submission, updated_at: Date.now() });
    } else {
      await db.declarations.add({
        taxYear, type, fields: {}, status: 'draft', submission, updated_at: Date.now(),
      });
    }
  });
}

// ── Utskriftsvy ───────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kr = (n: number) => n.toLocaleString('sv-SE') + ' kr';

export function renderNePrintHtml(
  taxYear: number,
  rows: NeRow[],
  companyName: string,
  blankettTitle = 'NE-bilagan',
): string {
  const tr = rows
    .filter(r => r.value !== 0 || r.auto !== 0 || r.kind === 'computed')
    .map(r => `<tr class="${r.kind === 'computed' ? 'sum' : ''}">
      <td class="id">${r.id}</td><td>${esc(r.label)}${r.adjusted ? ' *' : ''}</td>
      <td class="num">${kr(r.value)}</td></tr>`)
    .join('\n');
  const adjusted = rows.filter(r => r.adjusted);
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<title>Deklarationsunderlag ${taxYear}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color:#0f172a; margin:40px; }
  h1 { font-size:22px; margin:0 0 2px; } .muted { color:#64748b; font-size:13px; }
  table { width:100%; border-collapse:collapse; margin-top:20px; font-size:14px; }
  td { padding:6px 8px; border-bottom:1px solid #e2e8f0; }
  td.id { width:3em; font-weight:600; color:#64748b; } td.num { text-align:right; white-space:nowrap; }
  tr.sum td { font-weight:700; border-top:2px solid #0f172a; background:#f8fafc; }
  .foot { margin-top:24px; font-size:12px; color:#64748b; }
  @media print { body { margin:20px; } }
</style></head><body>
<h1>Underlag ${blankettTitle} — beskattningsår ${taxYear}</h1>
<div class="muted">${esc(companyName)} · Skapad ${new Date().toISOString().slice(0, 10)} · För manuell inmatning i Skatteverkets e-tjänst</div>
<table>${tr}</table>
${adjusted.length > 0 ? `<div class="foot"><strong>* Manuellt justerade rader:</strong><br>${
  adjusted.map(r => `${r.id}: ${kr(r.value)} (bokfört ${kr(r.auto)})${r.note ? ' — ' + esc(r.note) : ''}`).join('<br>')
}</div>` : ''}
<div class="foot">Förenklad kontomappning — kontrollera beloppen mot blanketten innan inlämning.
Schablonavdrag för egenavgifter (25&nbsp;%) och ev. ytterligare skattemässiga justeringar görs i e-tjänsten.</div>
</body></html>`;
}
