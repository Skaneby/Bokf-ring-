// Deterministisk SRU-serialisering: serialize(SruPackage) → { info, blanketter }.
// Ren funktion — ingen IO, ingen klocka, ingen slump. Samma paket ger alltid
// byte-identiska filer (golden-file- och hashverifierbart).
//
// VERIFIERAS mot Skatteverkets tekniska beskrivning innan produktion:
// radbrytning (CRLF), taggordning, obligatoriska fält, fältkodslängd,
// maxlängd för värden. Alla sådana antaganden är samlade som konstanter här.

import {
  SruPackage, SruBlankett, SruFiles, SruUppgift,
  SRU_MAX_BLANKETTER_BYTES, SRU_FILENAME_BLANKETTER,
} from './types';
import { SruError, assertAllowedText, encodeLatin1 } from './encoding';
import { toIdNumber12 } from './idnummer';

const NEWLINE = '\r\n';            // VERIFIERAS
const MAX_VALUE_LENGTH = 250;      // teknisk spärr — VERIFIERAS per fältkod
const FIELD_CODE_RE = /^\d{4}$/;   // fältkoder är 4 siffror — VERIFIERAS
const FORM_CODE_RE = /^[A-Z0-9]{1,10}-\d{4}P\d+$/; // t.ex. INK2R-2026P1 — VERIFIERAS
const DATE_RE = /^\d{8}$/;
const TIME_RE = /^\d{6}$/;

// ── Validering av paketets delar (nivå 1–2, teknisk/syntaktisk) ─────────────

function assertTimestamp(ts: { date: string; time: string }): void {
  if (!DATE_RE.test(ts.date) || !TIME_RE.test(ts.time)) {
    throw new SruError('SRU-TS-01', `Tidsstämpel ska vara ÅÅÅÅMMDD + TTMMSS, fick "${ts.date} ${ts.time}".`);
  }
}

function assertValue(value: string, context: string): void {
  if (value.length === 0) throw new SruError('SRU-VAL-01', `Tomt värde i ${context} — utelämna raden istället.`);
  if (/[\r\n]/.test(value)) throw new SruError('SRU-VAL-02', `Radbrytning i värde är inte tillåtet (${context}).`);
  if (value !== value.trim()) throw new SruError('SRU-VAL-03', `Inledande/avslutande blanksteg i ${context}.`);
  if (value.length > MAX_VALUE_LENGTH) {
    throw new SruError('SRU-VAL-04', `Värdet i ${context} är ${value.length} tecken — max ${MAX_VALUE_LENGTH}.`);
  }
  assertAllowedText(value, context);
}

// ── Normalisering — deterministisk ordning oavsett indata ────────────────────

function compareUppgift(a: SruUppgift, b: SruUppgift): number {
  return a.fieldCode.localeCompare(b.fieldCode) || a.value.localeCompare(b.value);
}

function compareBlankett(a: SruBlankett, b: SruBlankett): number {
  return a.formCode.localeCompare(b.formCode) || a.idNumber.localeCompare(b.idNumber);
}

// Exporteras för round-trip-tester: parse(serialize(x)) jämförs mot normalize(x).
export function normalizePackage(pkg: SruPackage): SruPackage {
  return {
    ...pkg,
    sender: { ...pkg.sender, orgNumber: toIdNumber12(pkg.sender.orgNumber) },
    blanketter: pkg.blanketter
      .map(b => ({
        ...b,
        idNumber: toIdNumber12(b.idNumber),
        uppgifter: [...b.uppgifter].sort(compareUppgift),
      }))
      .sort(compareBlankett),
  };
}

// ── Serialisering ─────────────────────────────────────────────────────────────

function infoLines(pkg: SruPackage): string[] {
  const s = pkg.sender;
  const lines = [
    '#DATABESKRIVNING_START',
    '#PRODUKT SRU',
    `#SKAPAD ${pkg.createdAt.date} ${pkg.createdAt.time}`,
    `#PROGRAM ${pkg.program.name} ${pkg.program.version}`,
    `#FILNAMN ${SRU_FILENAME_BLANKETTER}`,
    '#DATABESKRIVNING_SLUT',
    '#MEDIELEV_START',
    `#ORGNR ${s.orgNumber}`,
    `#NAMN ${s.name}`,
  ];
  // Frivilliga kontaktuppgifter — raden utelämnas helt om uppgiften saknas
  if (s.address)    lines.push(`#ADRESS ${s.address}`);
  if (s.postalCode) lines.push(`#POSTNR ${s.postalCode}`);
  if (s.city)       lines.push(`#POSTORT ${s.city}`);
  if (s.contact)    lines.push(`#KONTAKT ${s.contact}`);
  if (s.email)      lines.push(`#EMAIL ${s.email}`);
  if (s.phone)      lines.push(`#TELEFON ${s.phone}`);
  lines.push('#MEDIELEV_SLUT', '#FIL_SLUT');
  return lines;
}

function blankettLines(pkg: SruPackage): string[] {
  const lines: string[] = [];
  for (const b of pkg.blanketter) {
    lines.push(`#BLANKETT ${b.formCode}`);
    lines.push(`#IDENTITET ${b.idNumber} ${pkg.createdAt.date} ${pkg.createdAt.time}`);
    if (b.name) lines.push(`#NAMN ${b.name}`);
    for (const u of b.uppgifter) lines.push(`#UPPGIFT ${u.fieldCode} ${u.value}`);
    lines.push('#BLANKETTSLUT');
  }
  lines.push('#FIL_SLUT');
  return lines;
}

function validatePackage(pkg: SruPackage): void {
  assertTimestamp(pkg.createdAt);
  assertValue(pkg.program.name, '#PROGRAM (namn)');
  assertValue(pkg.program.version, '#PROGRAM (version)');
  assertValue(pkg.sender.name, 'uppgiftslämnarens namn');
  for (const key of ['address', 'postalCode', 'city', 'contact', 'email', 'phone'] as const) {
    const v = pkg.sender[key];
    if (v !== undefined) assertValue(v, `uppgiftslämnarens ${key}`);
  }
  if (pkg.blanketter.length === 0) {
    throw new SruError('SRU-EMPTY-01', 'Paketet innehåller inga blanketter — inget att exportera.');
  }
  for (const b of pkg.blanketter) {
    if (!FORM_CODE_RE.test(b.formCode)) {
      throw new SruError('SRU-FORM-01',
        `Okänd blankettkod "${b.formCode}" — förväntat format t.ex. INK2R-2026P1.`);
    }
    if (b.name !== undefined) assertValue(b.name, `namn på blankett ${b.formCode}`);
    if (b.uppgifter.length === 0) {
      throw new SruError('SRU-FORM-02', `Blankett ${b.formCode} saknar uppgifter.`);
    }
    const seen = new Set<string>();
    for (const u of b.uppgifter) {
      if (!FIELD_CODE_RE.test(u.fieldCode)) {
        throw new SruError('SRU-FIELD-01',
          `Ogiltig fältkod "${u.fieldCode}" på ${b.formCode} — fyra siffror förväntas.`);
      }
      if (seen.has(u.fieldCode)) {
        throw new SruError('SRU-FIELD-02',
          `Fältkod ${u.fieldCode} förekommer flera gånger på ${b.formCode}.`);
      }
      seen.add(u.fieldCode);
      assertValue(u.value, `fält ${u.fieldCode} på ${b.formCode}`);
    }
  }
}

export function serialize(input: SruPackage): SruFiles {
  const pkg = normalizePackage(input); // normalisering validerar även id-nummer
  validatePackage(pkg);

  const info = encodeLatin1(infoLines(pkg).join(NEWLINE) + NEWLINE);
  const blanketter = encodeLatin1(blankettLines(pkg).join(NEWLINE) + NEWLINE);

  if (blanketter.length > SRU_MAX_BLANKETTER_BYTES) {
    throw new SruError('SRU-SIZE-01',
      `${SRU_FILENAME_BLANKETTER} blev ${(blanketter.length / 1048576).toFixed(1)} MB — ` +
      `max 5 MB. Dela upp deklarationen i flera exporter.`);
  }
  return { info, blanketter };
}
