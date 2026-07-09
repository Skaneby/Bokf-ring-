export const VAT_OUT: Record<number, number> = { 6: 2630, 12: 2620, 25: 2610 };
export const VAT_IN = 2640;

export function splitVat(gross: number, rate: number) {
  const vat = Math.round(gross * rate / (100 + rate) * 100) / 100;
  return { net: Math.round((gross - vat) * 100) / 100, vat };
}

// ── Omvänd skattskyldighet / förvärvsmoms ──────────────────────────────────────
// Vid inköp från utlandet fakturerar säljaren UTAN moms. Köparen beräknar själv
// både utgående och ingående svensk moms (nettoeffekt noll om fullt avdragsgill)
// och redovisar förvärvet i särskilda rutor. Beloppet som anges är NETTO
// (fakturabeloppet), inte inkl. moms — därav egen beräkning här.

export type ReverseKind = 'eu-service' | 'non-eu-service' | 'eu-goods' | 'non-eu-goods';

// Inköpskonto (kostnad) per förvärvstyp och momssats → styr momsruta 20/21/22/50
export const REVERSE_COST: Record<ReverseKind, Record<number, number>> = {
  'eu-service':     { 25: 4531, 12: 4532, 6: 4533 },
  'non-eu-service': { 25: 4535, 12: 4536, 6: 4537 },
  'eu-goods':       { 25: 4515, 12: 4516, 6: 4517 },
  'non-eu-goods':   { 25: 4545, 12: 4546, 6: 4547 },  // import av varor
};

// Beräknad UTGÅENDE moms per förvärvstyp och sats → momsruta 30/31/32 (förvärv) eller 60/61/62 (import)
export const REVERSE_OUT_VAT: Record<ReverseKind, Record<number, number>> = {
  'eu-service':     { 25: 2614, 12: 2624, 6: 2634 },
  'non-eu-service': { 25: 2614, 12: 2624, 6: 2634 },
  'eu-goods':       { 25: 2615, 12: 2625, 6: 2635 },
  'non-eu-goods':   { 25: 2616, 12: 2626, 6: 2636 },  // varuimport
};

// Beräknad INGÅENDE moms (avdragsgill) → momsruta 48
export const REVERSE_IN_VAT = 2645;

export const REVERSE_LABELS: Record<ReverseKind, string> = {
  'eu-service':     'Omvänd moms – tjänst från EU',
  'non-eu-service': 'Omvänd moms – tjänst utanför EU',
  'eu-goods':       'Omvänd moms – varor från EU',
  'non-eu-goods':   'Import – varor utanför EU',
};

// Moms på förvärv = netto × sats (fakturan är momsfri, beloppet är alltså netto)
export function reverseVat(net: number, rate: number): number {
  return Math.round(net * rate / 100 * 100) / 100;
}

// Bygger en balanserad förvärvsmoms-verifikation:
//   Debet  inköpskonto (45xx)                 netto
//   Kredit motpart (bank/leverantörsskuld)    netto
//   Kredit beräknad utgående moms (26xx)      moms
//   Debet  beräknad ingående moms (2645)      moms
// Summa debet = netto + moms = summa kredit.
export function reverseChargeRows(
  net: number,
  rate: 6 | 12 | 25,
  kind: ReverseKind,
  counterAccount = 1930,
) {
  const vat     = reverseVat(net, rate);
  const costAcc = REVERSE_COST[kind][rate];
  const outAcc  = REVERSE_OUT_VAT[kind][rate];
  return [
    { accountId: costAcc,        debit: net, credit: 0   },
    { accountId: counterAccount, debit: 0,   credit: net },
    { accountId: REVERSE_IN_VAT, debit: vat, credit: 0   },
    { accountId: outAcc,         debit: 0,   credit: vat },
  ];
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
