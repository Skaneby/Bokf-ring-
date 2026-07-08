// Periodfiltrering för rapporter (P2) — ren, testbar logik.
//
// RAPPORTSEMANTIK (viktigt):
// - Resultaträkning/moms: transaktioner INOM perioden (inPeriod)
// - Balansräkning: ackumulerat saldo t.o.m. periodens SLUT (throughEnd)
//   — en balansräkning per Q2 visar ställningen 30 juni, inte kvartalets flöde.

import { Voucher, Transaction } from '../db';

export interface Period {
  year: number;
  quarter?: 1 | 2 | 3 | 4; // används bara om month saknas
  month?: number;          // 1–12
}

// Datumintervall (inklusivt) som ISO-strängar — jämförbara lexikalt med v.date
export function periodRange(p: Period): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate(); // m är 1-baserad

  if (p.month) {
    return {
      from: `${p.year}-${pad(p.month)}-01`,
      to: `${p.year}-${pad(p.month)}-${pad(lastDay(p.year, p.month))}`,
    };
  }
  if (p.quarter) {
    const fromMonth = (p.quarter - 1) * 3 + 1;
    const toMonth = fromMonth + 2;
    return {
      from: `${p.year}-${pad(fromMonth)}-01`,
      to: `${p.year}-${pad(toMonth)}-${pad(lastDay(p.year, toMonth))}`,
    };
  }
  return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
}

const MONTH_NAMES = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

export function periodLabel(p: Period | null): string {
  if (!p) return 'Alla perioder';
  if (p.month) return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
  if (p.quarter) return `kvartal ${p.quarter} ${p.year}`;
  return `helår ${p.year}`;
}

export interface PeriodSplit {
  inPeriod: Transaction[];   // för resultaträkning, huvudbok, momsrapport
  throughEnd: Transaction[]; // för balansräkning (ackumulerat t.o.m. periodslut)
  voucherIdsInPeriod: Set<number>;
}

// Delar transaktionerna enligt rapportsemantiken ovan. period = null → allt.
export function splitByPeriod(
  vouchers: Voucher[],
  transactions: Transaction[],
  period: Period | null,
): PeriodSplit {
  if (!period) {
    return {
      inPeriod: transactions,
      throughEnd: transactions,
      voucherIdsInPeriod: new Set(vouchers.map(v => v.id!)),
    };
  }
  const { from, to } = periodRange(period);
  const idsInPeriod = new Set<number>();
  const idsThroughEnd = new Set<number>();
  for (const v of vouchers) {
    if (v.date <= to) {
      idsThroughEnd.add(v.id!);
      if (v.date >= from) idsInPeriod.add(v.id!);
    }
  }
  return {
    inPeriod: transactions.filter(t => idsInPeriod.has(t.voucherId)),
    throughEnd: transactions.filter(t => idsThroughEnd.has(t.voucherId)),
    voucherIdsInPeriod: idsInPeriod,
  };
}
