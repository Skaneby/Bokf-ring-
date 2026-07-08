// P4 — Årsavslut för enskild firma (förenklat årsbokslut).
//
// Två verifikat enligt standardpraxis:
//   1. Resultatdisposition (31/12 stängda året):
//      vinst R: debet 8999 / kredit 2019  (förlust: omvänt)
//   2. Omföring av eget kapital (1/1 nya året):
//      2013 Egna uttag, 2018 Egna insättningar och 2019 Årets resultat
//      nollställs mot 2010 Eget kapital.
//
// RAPPORTKONVENTION (viktig):
// - 8999 EXKLUDERAS ur resultaträkningen/Översikten — annars skulle det
//   stängda årets resultatrapport visa 0. Konstanten RESULT_EXCLUDED_ACCOUNTS
//   används av ResultatTab och Dashboard.
// - Balansräkningens "Beräknat resultat" INKLUDERAR 8999: efter disposition
//   blir odisponerat resultat 0 och EK-sidan bär resultatet via 2019/2010 —
//   balansekvationen håller i varje läge.
// - NE (R-intervall ≤ 8799), INK2 (exkl. 899x) och moms påverkas inte.

import { db, Voucher, Transaction } from '../db';

export const RESULT_DISPOSITION_ACCOUNT = 8999;
export const RESULT_EXCLUDED_ACCOUNTS = new Set([RESULT_DISPOSITION_ACCOUNT]);

const EK_ACCOUNT = 2010;
const UTTAG = 2013;
const INSATTNING = 2018;
const ARETS_RESULTAT = 2019;

export interface YearEndPreview {
  year: number;
  resultat: number;      // odisponerat resultat t.o.m. 31/12 (vinst +, förlust −)
  uttag: number;         // ackumulerat saldo 2013 (debet +)
  insattningar: number;  // ackumulerat saldo 2018 (kredit, visas +)
  alreadyClosed: boolean;
  hasAnything: boolean;
}

const closingDescription = (year: number) => `Årsavslut ${year}`;

export function calcYearEnd(
  vouchers: Voucher[],
  transactions: Transaction[],
  year: number,
): YearEndPreview {
  const cutoff = `${year}-12-31`;
  const voucherOk = new Map(vouchers.map(v => [v.id!, v.date <= cutoff]));

  let resultSaldo = 0, uttag = 0, insattning = 0;
  for (const t of transactions) {
    if (!voucherOk.get(t.voucherId)) continue;
    // Odisponerat resultat: ALLA resultatkonton inkl. tidigare års 8999-
    // dispositioner — nettot är det som ännu inte förts till eget kapital
    if (t.accountId >= 3000 && t.accountId <= 8999) resultSaldo += t.amount;
    if (t.accountId === UTTAG) uttag += t.amount;
    if (t.accountId === INSATTNING) insattning += t.amount;
  }

  const resultat = Math.round(-resultSaldo * 100) / 100; // kreditöverskott = vinst
  const uttagR = Math.round(uttag * 100) / 100;
  const insattningR = Math.round(-insattning * 100) / 100;

  const alreadyClosed = vouchers.some(v => v.description.startsWith(closingDescription(year)));
  return {
    year,
    resultat,
    uttag: uttagR,
    insattningar: insattningR,
    alreadyClosed,
    hasAnything: resultat !== 0 || uttagR !== 0 || insattningR !== 0,
  };
}

// Genomför årsavslutet. Kastar om året redan är avslutat eller inget finns
// att avsluta. Returnerar antal skapade verifikat.
export async function performYearEnd(year: number): Promise<number> {
  return db.transaction('rw', db.vouchers, db.transactions, async () => {
    const vouchers = await db.vouchers.toArray();
    const transactions = await db.transactions.toArray();
    const preview = calcYearEnd(vouchers, transactions, year);

    if (preview.alreadyClosed) throw new Error(`Årsavslut ${year} är redan genomfört.`);
    if (!preview.hasAnything) throw new Error(`Inget att avsluta för ${year}.`);

    let created = 0;
    const book = async (date: string, description: string, legs: { accountId: number; amount: number }[]) => {
      const active = legs.filter(l => Math.abs(l.amount) >= 0.005);
      if (active.length === 0) return;
      const sum = active.reduce((s, l) => s + l.amount, 0);
      if (Math.abs(sum) > 0.005) throw new Error('Årsavslutet balanserar inte — avbryter.');
      const vid = await db.vouchers.add({ date, description, created_at: Date.now() });
      await db.transactions.bulkAdd(active.map(l => ({ ...l, voucherId: vid as number })));
      created++;
    };

    // 1. Resultatdisposition per 31/12: nollställ odisponerat resultat via 8999→2019
    await book(`${year}-12-31`, `${closingDescription(year)} — resultatdisposition`, [
      { accountId: RESULT_DISPOSITION_ACCOUNT, amount: preview.resultat },
      { accountId: ARETS_RESULTAT, amount: -preview.resultat },
    ]);

    // 2. Omföring av eget kapital per 1/1: nollställ 2013/2018/2019 mot 2010
    await book(`${year + 1}-01-01`, `${closingDescription(year)} — omföring eget kapital`, [
      { accountId: UTTAG, amount: -preview.uttag },
      { accountId: INSATTNING, amount: preview.insattningar },
      { accountId: ARETS_RESULTAT, amount: preview.resultat },
      { accountId: EK_ACCOUNT, amount: preview.uttag - preview.insattningar - preview.resultat },
    ]);

    return created;
  });
}
