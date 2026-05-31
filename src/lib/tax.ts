import { Account, Transaction } from '../db';

// ── Egenavgifter ─────────────────────────────────────────────────────────────

export type AgeBracket = 'full' | 'young' | 'senior';

// 2024 rates (Skatteverket)
export const EGENAVGIFTER_RATE: Record<AgeBracket, number> = {
  full:   0.2897,  // age 26–65
  young:  0.1489,  // under 26
  senior: 0.1488,  // 66+
};

export function calculateEgenavgifter(netIncome: number, bracket: AgeBracket = 'full'): number {
  if (netIncome <= 0) return 0;
  return Math.round(netIncome * EGENAVGIFTER_RATE[bracket] * 100) / 100;
}

// ── NE-bilagan (SKV 2161) ─────────────────────────────────────────────────────

export interface NELines {
  nettoomsattning: number;       // R1  accounts 3000–3799
  ovrigaIntakter: number;        // R4  accounts 3800–3999
  summaIntakter: number;         // R9
  handelvaror: number;           // R10 accounts 4000–4899
  ovrigaExterna: number;         // R11 accounts 5000–6999
  personalkostnader: number;     // R12 accounts 7000–7699
  avskrivningar: number;         // R13 accounts 7800–7899
  ovrigaRorelse: number;         // R14 accounts 7900–7999
  summaKostnader: number;        // R17
  rorelseresultat: number;       // R18 = R9 − R17
  finansiellaIntakter: number;   // R19 accounts 8000–8399
  finansiellaKostnader: number;  // R20 accounts 8400–8799 (inkl. egenavgifter 8422)
  aretsResultat: number;         // R18 + R19 − R20  (positive = överskott → INK1 ruta 10)
}

function sumRange(balMap: Map<number, number>, from: number, to: number): number {
  let total = 0;
  for (const [id, bal] of balMap) {
    if (id >= from && id <= to) total += bal;
  }
  return total;
}

export function calcNELines(transactions: Transaction[]): NELines {
  const balMap = new Map<number, number>();
  for (const t of transactions) {
    balMap.set(t.accountId, (balMap.get(t.accountId) ?? 0) + t.amount);
  }

  // Revenue accounts carry negative balances (credit) → negate for NE
  const nettoomsattning   = -sumRange(balMap, 3000, 3799);
  const ovrigaIntakter    = -sumRange(balMap, 3800, 3999);
  const summaIntakter     = nettoomsattning + ovrigaIntakter;

  // Expense accounts carry positive balances (debit)
  const handelvaror       = sumRange(balMap, 4000, 4899);
  const ovrigaExterna     = sumRange(balMap, 5000, 6999);
  const personalkostnader = sumRange(balMap, 7000, 7699);
  const avskrivningar     = sumRange(balMap, 7800, 7899);
  const ovrigaRorelse     = sumRange(balMap, 7900, 7999);
  const summaKostnader    = handelvaror + ovrigaExterna + personalkostnader + avskrivningar + ovrigaRorelse;

  const rorelseresultat      = summaIntakter - summaKostnader;
  const finansiellaIntakter  = -sumRange(balMap, 8000, 8399);
  const finansiellaKostnader =  sumRange(balMap, 8400, 8799);
  const aretsResultat        = rorelseresultat + finansiellaIntakter - finansiellaKostnader;

  return {
    nettoomsattning, ovrigaIntakter, summaIntakter,
    handelvaror, ovrigaExterna, personalkostnader, avskrivningar, ovrigaRorelse,
    summaKostnader, rorelseresultat,
    finansiellaIntakter, finansiellaKostnader, aretsResultat,
  };
}

// ── Momsdeklaration ──────────────────────────────────────────────────────────

export interface MomsLines {
  box05: number;  // Momspliktiga intäkter (netto) — accounts 3000–3002
  box10: number;  // Utgående moms 25 % — account 2610
  box11: number;  // Utgående moms 12 % — account 2620
  box12: number;  // Utgående moms 6 %  — account 2630
  box48: number;  // Ingående moms      — account 2640
  box49: number;  // Att betala (+) / återfå (−) = box10+11+12 − box48
}

export function calcMomsLines(transactions: Transaction[]): MomsLines {
  const bal = new Map<number, number>();
  for (const t of transactions) bal.set(t.accountId, (bal.get(t.accountId) ?? 0) + t.amount);

  const box05 = -((bal.get(3000) ?? 0) + (bal.get(3001) ?? 0) + (bal.get(3002) ?? 0));
  const box10 = -(bal.get(2610) ?? 0);
  const box11 = -(bal.get(2620) ?? 0);
  const box12 = -(bal.get(2630) ?? 0);
  const box48 =   bal.get(2640) ?? 0;
  const box49 = box10 + box11 + box12 - box48;

  return { box05, box10, box11, box12, box48, box49 };
}

// ── Uttags-mallar ─────────────────────────────────────────────────────────────

export interface UttaqTemplate {
  label: string;
  description: string;
  rows: { accountId: number; debit: number; credit: number }[];
}

// Derived lazily so label list is always in sync with template definitions
export const TEMPLATE_LABELS = ['Eget uttag', 'F-skatt', 'Eget insättning', 'Egenavgifter'] as const;

export function uttaqTemplates(amount: number): UttaqTemplate[] {
  return [
    {
      label: 'Eget uttag',
      description: 'Eget uttag',
      rows: [
        { accountId: 2013, debit: amount, credit: 0 },
        { accountId: 1930, debit: 0, credit: amount },
      ],
    },
    {
      label: 'F-skatt',
      description: 'F-skatt betalning',
      rows: [
        { accountId: 2510, debit: amount, credit: 0 },
        { accountId: 1930, debit: 0, credit: amount },
      ],
    },
    {
      label: 'Eget insättning',
      description: 'Eget insättning',
      rows: [
        { accountId: 1930, debit: amount, credit: 0 },
        { accountId: 2018, debit: 0, credit: amount },
      ],
    },
    {
      label: 'Egenavgifter',
      description: 'Avsättning beräknade egenavgifter',
      rows: [
        { accountId: 8422, debit: amount, credit: 0 },
        { accountId: 2514, debit: 0, credit: amount },
      ],
    },
  ];
}
