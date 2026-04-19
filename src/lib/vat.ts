export const VAT_OUT: Record<number, number> = { 6: 2630, 12: 2620, 25: 2610 };
export const VAT_IN = 2640;

export function splitVat(gross: number, rate: number) {
  const vat = Math.round(gross * rate / (100 + rate) * 100) / 100;
  return { net: Math.round((gross - vat) * 100) / 100, vat };
}

export function vatRows(gross: number, rate: number, dir: 'in' | 'out') {
  const { net, vat } = splitVat(gross, rate);
  const vatAcc = dir === 'out' ? VAT_OUT[rate] : VAT_IN;
  if (dir === 'out') {
    return [
      { accountId: 1930,   debit: gross, credit: 0 },
      { accountId: 0,      debit: 0,     credit: net },   // revenue — user picks account
      { accountId: vatAcc, debit: 0,     credit: vat },
    ];
  }
  return [
    { accountId: 0,      debit: net,   credit: 0 },   // expense — user picks account
    { accountId: vatAcc, debit: vat,   credit: 0 },
    { accountId: 1930,   debit: 0,     credit: gross },
  ];
}
