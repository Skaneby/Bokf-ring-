// INK2 (aktiebolag) — förenklat räkenskapsschema (INK2R) och skattemässiga
// justeringar (INK2S) enligt samma mönster som NE-blankettvyn.
//
// FÖRENKLAT: posterna är aggregerade kontointervall, inte blankettens
// officiella postnumrering (2.x/3.x/4.x) — därför egna rad-id:n (T/E/I/K/F/J).
// Alla leaf-rader är justerbara; summarader räknas om från gällande värden.
// SRU-fältkoder är PLATSHÅLLARE (VERIFIERAS mot SKV 269 före skarp inlämning).

import { Voucher, Transaction } from '../db';
import { NeRow, NeAdjustments, NeLineDef } from './declaration';
import { SruPackage } from './sru';
import { CompanySettings } from './invoice';

export const INK2_FALTKODER_VERIFIED = false;
export const INK2R_FORM_CODE = (taxYear: number) => `INK2R-${taxYear}P1`; // VERIFIERAS
export const INK2S_FORM_CODE = (taxYear: number) => `INK2S-${taxYear}P1`; // VERIFIERAS

// Balansrader värderas per bokslutsdagen: ackumulerat saldo t.o.m. beskattningsåret.
// Resultatrader avser enbart beskattningsårets transaktioner.
type Ink2Kind = NeLineDef['kind'] | 'asset' | 'liability';

interface Ink2LineDef {
  id: string;
  label: string;
  kind: Ink2Kind;
  accounts?: { from: number; to: number }[]; // FÖRENKLAD mappning — VERIFIERAS
}

export const INK2R_LINES: Ink2LineDef[] = [
  // Tillgångar (debetsaldo visas positivt)
  { id: 'T1', label: 'Anläggningstillgångar', kind: 'asset', accounts: [{ from: 1000, to: 1399 }] },
  { id: 'T2', label: 'Varulager', kind: 'asset', accounts: [{ from: 1400, to: 1499 }] },
  { id: 'T3', label: 'Kundfordringar', kind: 'asset', accounts: [{ from: 1500, to: 1599 }] },
  { id: 'T4', label: 'Övriga fordringar och förutbetalda kostnader', kind: 'asset', accounts: [{ from: 1600, to: 1799 }] },
  { id: 'T5', label: 'Kassa, bank och kortfristiga placeringar', kind: 'asset', accounts: [{ from: 1800, to: 1999 }] },
  { id: 'TS', label: 'Summa tillgångar', kind: 'computed' },
  // Eget kapital & skulder (kreditsaldo visas positivt)
  { id: 'E1', label: 'Eget kapital', kind: 'liability', accounts: [{ from: 2000, to: 2099 }] },
  { id: 'E2', label: 'Obeskattade reserver', kind: 'liability', accounts: [{ from: 2100, to: 2199 }] },
  { id: 'E3', label: 'Avsättningar och långfristiga skulder', kind: 'liability', accounts: [{ from: 2200, to: 2399 }] },
  { id: 'E4', label: 'Kortfristiga skulder', kind: 'liability', accounts: [{ from: 2400, to: 2999 }] },
  { id: 'ES', label: 'Summa eget kapital och skulder (inkl. årets resultat)', kind: 'computed' },
  // Resultaträkning (beskattningsåret)
  { id: 'I1', label: 'Nettoomsättning', kind: 'revenue', accounts: [{ from: 3000, to: 3799 }] },
  { id: 'I2', label: 'Övriga rörelseintäkter', kind: 'revenue', accounts: [{ from: 3800, to: 3999 }] },
  { id: 'K1', label: 'Råvaror, handelsvaror och tjänster', kind: 'expense', accounts: [{ from: 4000, to: 4999 }] },
  { id: 'K2', label: 'Övriga externa kostnader', kind: 'expense', accounts: [{ from: 5000, to: 6999 }] },
  { id: 'K3', label: 'Personalkostnader', kind: 'expense', accounts: [{ from: 7000, to: 7699 }] },
  { id: 'K4', label: 'Av- och nedskrivningar', kind: 'expense', accounts: [{ from: 7700, to: 7899 }] },
  { id: 'K5', label: 'Övriga rörelsekostnader', kind: 'expense', accounts: [{ from: 7900, to: 7999 }] },
  { id: 'F1', label: 'Finansiella intäkter', kind: 'revenue', accounts: [{ from: 8000, to: 8399 }] },
  { id: 'F2', label: 'Finansiella kostnader och skatter', kind: 'expense', accounts: [{ from: 8400, to: 8999 }] },
  { id: 'RR', label: 'Årets resultat (bokfört)', kind: 'computed' },
];

export const INK2S_LINES: Ink2LineDef[] = [
  { id: 'J1', label: 'Bokfört resultat (överskott + / underskott −)', kind: 'computed' },
  { id: 'J2', label: 'Bokförda kostnader som inte ska dras av', kind: 'manual' },
  { id: 'J3', label: 'Bokförda intäkter som inte ska tas upp', kind: 'manual' },
  { id: 'J4', label: 'Övriga skattemässiga justeringar (+/−)', kind: 'manual' },
  { id: 'JR', label: 'Skattemässigt resultat', kind: 'computed' },
];

const INK2_REVENUE = ['I1', 'I2', 'F1'];
const INK2_EXPENSE = ['K1', 'K2', 'K3', 'K4', 'K5', 'F2'];

// Bygger alla INK2-rader (INK2R + INK2S) för ett beskattningsår.
export function buildInk2Rows(
  vouchers: Voucher[],
  transactions: Transaction[],
  taxYear: number,
  adjustments: NeAdjustments = {},
): NeRow[] {
  const voucherYear = new Map(vouchers.map(v => [v.id!, parseInt(v.date.slice(0, 4), 10)]));

  // Två saldokartor: balans = ackumulerat t.o.m. året; resultat = enbart året
  const balCum = new Map<number, number>();
  const balYear = new Map<number, number>();
  for (const t of transactions) {
    const year = voucherYear.get(t.voucherId);
    if (year === undefined || year > taxYear) continue;
    balCum.set(t.accountId, (balCum.get(t.accountId) ?? 0) + t.amount);
    if (year === taxYear) balYear.set(t.accountId, (balYear.get(t.accountId) ?? 0) + t.amount);
  }

  const sumRanges = (map: Map<number, number>, ranges: { from: number; to: number }[]) => {
    let total = 0;
    for (const [accountId, saldo] of map) {
      if (ranges.some(r => accountId >= r.from && accountId <= r.to)) total += saldo;
    }
    return total;
  };

  const rows: NeRow[] = [...INK2R_LINES, ...INK2S_LINES].map(def => {
    let auto = 0;
    if (def.accounts) {
      const isBalance = def.kind === 'asset' || def.kind === 'liability';
      const saldo = sumRanges(isBalance ? balCum : balYear, def.accounts);
      const creditPositive = def.kind === 'liability' || def.kind === 'revenue';
      auto = Math.round(creditPositive ? -saldo : saldo);
    }
    const adj = adjustments[def.id];
    const kind = (def.kind === 'asset' || def.kind === 'liability' ? 'expense' : def.kind) as NeRow['kind'];
    return {
      id: def.id, label: def.label, kind,
      auto,
      value: def.kind === 'computed' ? 0 : (adj ? Math.round(adj.value) : auto),
      adjusted: def.kind !== 'computed' && adj !== undefined,
      note: adj?.note,
    };
  });

  const get = (id: string) => rows.find(r => r.id === id)!;
  const sumOf = (ids: string[]) => ids.reduce((s, id) => s + get(id).value, 0);

  const arets = sumOf(INK2_REVENUE) - sumOf(INK2_EXPENSE);
  get('RR').value = arets; get('RR').auto = arets;
  get('TS').value = sumOf(['T1', 'T2', 'T3', 'T4', 'T5']);
  get('TS').auto  = get('TS').value;
  // Eget kapital/skulder redovisas inkl. årets bokförda resultat → ska matcha TS
  get('ES').value = sumOf(['E1', 'E2', 'E3', 'E4']) + arets;
  get('ES').auto  = get('ES').value;

  get('J1').value = arets; get('J1').auto = arets;
  const jr = arets + get('J2').value - get('J3').value + get('J4').value;
  get('JR').value = jr; get('JR').auto = jr;

  return rows;
}

// ── SRU-paket ─────────────────────────────────────────────────────────────────

// PLATSHÅLLARKODER (VERIFIERAS): INK2R-rader → 7200-serien, INK2S → 7500-serien
const INK2R_CODE: Record<string, string> = {
  T1: '7201', T2: '7202', T3: '7203', T4: '7204', T5: '7205', TS: '7206',
  E1: '7211', E2: '7212', E3: '7213', E4: '7214', ES: '7215',
  I1: '7221', I2: '7222', K1: '7231', K2: '7232', K3: '7233', K4: '7234',
  K5: '7235', F1: '7241', F2: '7242', RR: '7250',
};
const INK2S_CODE: Record<string, string> = {
  J1: '7501', J2: '7502', J3: '7503', J4: '7504', JR: '7510',
};

export interface Ink2SruInput {
  taxYear: number;
  rows: NeRow[];
  company: CompanySettings;
  createdAt: { date: string; time: string };
  program: { name: string; version: string };
}

export function buildInk2SruPackage(input: Ink2SruInput): SruPackage {
  const { taxYear, rows, company, createdAt, program } = input;
  const period = [
    { fieldCode: '7011', value: `${taxYear}-01-01` },
    { fieldCode: '7012', value: `${taxYear}-12-31` },
  ];
  const pick = (codes: Record<string, string>) =>
    rows
      .filter(r => codes[r.id] !== undefined && r.value !== 0)
      .map(r => ({ fieldCode: codes[r.id], value: String(r.value) }));

  return {
    createdAt,
    program,
    sender: {
      orgNumber: company.orgnr,
      name: company.name,
      ...(company.email ? { email: company.email } : {}),
    },
    blanketter: [
      {
        formCode: INK2R_FORM_CODE(taxYear),
        idNumber: company.orgnr,
        name: company.name,
        uppgifter: [...period, ...pick(INK2R_CODE)],
      },
      {
        formCode: INK2S_FORM_CODE(taxYear),
        idNumber: company.orgnr,
        name: company.name,
        uppgifter: [...period, ...pick(INK2S_CODE)],
      },
    ],
  };
}
