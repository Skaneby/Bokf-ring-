// Org-/personnummer: normalisering till 12 siffror + Luhn-kontroll.
// SRU-filer anger identiteter med 12 siffror inkl. sekel.

import { SruError } from './encoding';

// Luhn-kontrollsiffra för de första 9 siffrorna i ett 10-siffrigt nummer.
// Vikter 2,1,2,1,... från vänster; siffersumma; check = (10 − sum mod 10) mod 10.
export function luhnCheckDigit(digits9: string): number {
  if (!/^\d{9}$/.test(digits9)) throw new SruError('SRU-ORGNR-01', 'Luhn kräver exakt 9 siffror.');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const product = parseInt(digits9[i], 10) * (i % 2 === 0 ? 2 : 1);
    sum += product > 9 ? product - 9 : product;
  }
  return (10 - (sum % 10)) % 10;
}

export function luhnValid(digits10: string): boolean {
  if (!/^\d{10}$/.test(digits10)) return false;
  return luhnCheckDigit(digits10.slice(0, 9)) === parseInt(digits10[9], 10);
}

// Normaliserar "556000-0167", "5560000167" eller "165560000167" → "165560000167".
// Organisationsnummer (tredje siffran ≥ 2) sekelprefixas med "16".
// Personnummer måste anges med 12 siffror — appen kan inte gissa sekel.
export function toIdNumber12(input: string): string {
  const digits = input.replace(/[-+\s]/g, '');
  if (!/^\d{10}$/.test(digits) && !/^\d{12}$/.test(digits)) {
    throw new SruError(
      'SRU-ORGNR-01',
      `Org-/personnumret "${input}" har fel format — ange 10 eller 12 siffror.`,
    );
  }
  const body = digits.slice(-10);
  if (!luhnValid(body)) {
    throw new SruError(
      'SRU-ORGNR-01',
      `Org-/personnumret "${input}" har felaktig kontrollsiffra.`,
    );
  }
  if (digits.length === 12) return digits;
  if (parseInt(body[2], 10) >= 2) return '16' + body; // organisationsnummer
  throw new SruError(
    'SRU-ORGNR-02',
    `Personnummer måste anges med 12 siffror (inkl. sekel), fick "${input}".`,
  );
}
