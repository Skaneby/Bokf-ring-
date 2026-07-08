// Spår 0 — blankettvy NE (SKV 2161) för manuell deklaration.
// Bygger blankettrader från bokföringen + manuella justeringar.
// Se docs/deklarationsmodul-spec.md §8 (mappning) och §13 (UX).
//
// OBS: kontomappningen per R-rad är en FÖRENKLAD standardmappning märkt
// VERIFIERAS — den täcker appens standardkontoplan. Varje rad kan justeras
// manuellt, och justeringen vinner alltid över det bokförda värdet.
// SRU-fältkoder per rad fylls i vid M2 efter verifiering mot Skatteverket.

import { db, Declaration, DeclarationField, Voucher, Transaction } from '../db';

// ── Blankettdefinition ────────────────────────────────────────────────────────

export type NeLineKind =
  | 'revenue'   // intäktsrad: visas positivt från kreditsaldo
  | 'expense'   // kostnadsrad: visas positivt från debetsaldo
  | 'manual'    // ingår i beräkningen men saknar automappning (anges för hand)
  | 'computed'; // summarad — kan inte justeras

export interface NeLineDef {
  id: string;
  label: string;
  kind: NeLineKind;
  accounts?: { from: number; to: number }[]; // VERIFIERAS — förenklad mappning
  sruCode?: string; // fylls i vid M2 efter verifiering mot SKV
}

export const NE_LINES: NeLineDef[] = [
  { id: 'R1',  label: 'Försäljning och utfört arbete samt övriga momspliktiga intäkter',
    kind: 'revenue', accounts: [{ from: 3000, to: 3039 }, { from: 3041, to: 3799 }] },
  { id: 'R2',  label: 'Momsfria intäkter',
    kind: 'revenue', accounts: [{ from: 3040, to: 3040 }, { from: 3800, to: 3999 }] },
  { id: 'R3',  label: 'Bil- och bostadsförmån m.m.', kind: 'manual' },
  { id: 'R4',  label: 'Ränteintäkter m.m.',
    kind: 'revenue', accounts: [{ from: 8000, to: 8399 }] },
  { id: 'R5',  label: 'Varor, material och tjänster',
    kind: 'expense', accounts: [{ from: 4000, to: 4999 }] },
  { id: 'R6',  label: 'Övriga externa kostnader',
    kind: 'expense', accounts: [{ from: 5000, to: 6999 }] },
  { id: 'R7',  label: 'Anställd personal',
    kind: 'expense', accounts: [{ from: 7000, to: 7699 }] },
  { id: 'R8',  label: 'Räntekostnader m.m.',
    kind: 'expense', accounts: [{ from: 8400, to: 8421 }, { from: 8423, to: 8799 }] },
  { id: 'R9',  label: 'Avskrivningar byggnader och markanläggningar',
    kind: 'expense', accounts: [{ from: 7810, to: 7829 }] },
  { id: 'R10', label: 'Avskrivningar maskiner och inventarier',
    kind: 'expense', accounts: [{ from: 7830, to: 7899 }, { from: 7800, to: 7809 }] },
  { id: 'R11', label: 'Bokfört resultat', kind: 'computed' },
  { id: 'R12', label: 'Bokförda kostnader som inte ska dras av', kind: 'manual' },
  { id: 'R13', label: 'Bokförda intäkter som inte ska tas upp', kind: 'manual' },
  // Egenavgifter: avsättningen bokförs på 8422 i appen och dras som påförd
  // avgift här. Schablonavdrag 25 % (R43-justering) hanteras i e-tjänsten.
  { id: 'R43', label: 'Avdrag för egenavgifter (bokförd avsättning, konto 8422)',
    kind: 'expense', accounts: [{ from: 8422, to: 8422 }] },
  { id: 'R47', label: 'Överskott → INK1 ruta 10.1', kind: 'computed' },
  { id: 'R48', label: 'Underskott → INK1 ruta 10.2', kind: 'computed' },
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
  const yearVouchers = new Set(
    vouchers.filter(v => v.date.slice(0, 4) === String(taxYear)).map(v => v.id!),
  );
  const bal = new Map<number, number>();
  for (const t of transactions) {
    if (!yearVouchers.has(t.voucherId)) continue;
    bal.set(t.accountId, (bal.get(t.accountId) ?? 0) + t.amount);
  }

  const sumRanges = (ranges: { from: number; to: number }[]): number => {
    let total = 0;
    for (const [accountId, saldo] of bal) {
      if (ranges.some(r => accountId >= r.from && accountId <= r.to)) total += saldo;
    }
    return total;
  };

  // Steg 1: leaf-rader (auto + ev. justering)
  const rows: NeRow[] = NE_LINES.map(def => {
    let auto = 0;
    if (def.accounts) {
      const saldo = sumRanges(def.accounts);
      auto = Math.round(def.kind === 'revenue' ? -saldo : saldo); // hela kronor
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

  const slutligt = r11 + get('R12').value - get('R13').value - get('R43').value;
  get('R47').value = Math.max(0, slutligt);
  get('R47').auto  = get('R47').value;
  get('R48').value = Math.max(0, -slutligt);
  get('R48').auto  = get('R48').value;

  return rows;
}

// ── Persistens ────────────────────────────────────────────────────────────────

export async function getDeclaration(taxYear: number): Promise<Declaration | undefined> {
  return db.declarations.where('taxYear').equals(taxYear).filter(d => d.type === 'NE').first();
}

export async function saveAdjustment(
  taxYear: number,
  lineId: string,
  field: DeclarationField | null, // null = återställ till bokfört
): Promise<void> {
  await db.transaction('rw', db.declarations, async () => {
    const existing = await getDeclaration(taxYear);
    const fields = { ...(existing?.fields ?? {}) };
    if (field === null) delete fields[lineId];
    else fields[lineId] = field;
    if (existing) {
      await db.declarations.update(existing.id!, { fields, updated_at: Date.now() });
    } else {
      await db.declarations.add({ taxYear, type: 'NE', fields, status: 'draft', updated_at: Date.now() });
    }
  });
}

export async function setDeclarationStatus(taxYear: number, status: 'draft' | 'klar'): Promise<void> {
  await db.transaction('rw', db.declarations, async () => {
    const existing = await getDeclaration(taxYear);
    if (existing) {
      await db.declarations.update(existing.id!, { status, updated_at: Date.now() });
    } else {
      await db.declarations.add({ taxYear, type: 'NE', fields: {}, status, updated_at: Date.now() });
    }
  });
}

// ── Utskriftsvy ───────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kr = (n: number) => n.toLocaleString('sv-SE') + ' kr';

export function renderNePrintHtml(taxYear: number, rows: NeRow[], companyName: string): string {
  const tr = rows
    .filter(r => r.value !== 0 || r.auto !== 0 || r.kind === 'computed')
    .map(r => `<tr class="${r.kind === 'computed' ? 'sum' : ''}">
      <td class="id">${r.id}</td><td>${esc(r.label)}${r.adjusted ? ' *' : ''}</td>
      <td class="num">${kr(r.value)}</td></tr>`)
    .join('\n');
  const adjusted = rows.filter(r => r.adjusted);
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<title>NE-underlag ${taxYear}</title>
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
<h1>Underlag NE-bilagan — beskattningsår ${taxYear}</h1>
<div class="muted">${esc(companyName)} · Skapad ${new Date().toISOString().slice(0, 10)} · För manuell inmatning i Skatteverkets e-tjänst</div>
<table>${tr}</table>
${adjusted.length > 0 ? `<div class="foot"><strong>* Manuellt justerade rader:</strong><br>${
  adjusted.map(r => `${r.id}: ${kr(r.value)} (bokfört ${kr(r.auto)})${r.note ? ' — ' + esc(r.note) : ''}`).join('<br>')
}</div>` : ''}
<div class="foot">Förenklad kontomappning — kontrollera beloppen mot blanketten innan inlämning.
Schablonavdrag för egenavgifter (25&nbsp;%) och ev. ytterligare skattemässiga justeringar görs i e-tjänsten.</div>
</body></html>`;
}
