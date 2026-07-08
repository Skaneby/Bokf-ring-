// Strikt SRU-parser — byggd för round-trip-tester av serialiseraren
// (parse(serialize(x)) ska ge tillbaka normalize(x)). Den är avsiktligt
// strängare än en generell importparser: exakt CRLF, exakt taggordning.

import { SruBlankett, SruSender } from './types';
import { SruError, decodeLatin1 } from './encoding';

export interface ParsedInfo {
  skapad: { date: string; time: string };
  program: { name: string; version: string };
  filnamn: string;
  sender: SruSender;
}

function splitLines(bytes: Uint8Array, file: string): string[] {
  const text = decodeLatin1(bytes);
  if (!text.endsWith('\r\n')) throw new SruError('SRU-PARSE-01', `${file}: saknar avslutande CRLF.`);
  const lines = text.slice(0, -2).split('\r\n');
  if (lines.some(l => l.includes('\n') || l.includes('\r'))) {
    throw new SruError('SRU-PARSE-02', `${file}: blandade radbrytningar.`);
  }
  return lines;
}

// Delar "#TAGG resten av raden" → [tagg, rest]
function tagOf(line: string): { tag: string; rest: string } {
  const m = /^(#[A-Z_]+)(?: (.*))?$/.exec(line);
  if (!m) throw new SruError('SRU-PARSE-03', `Ogiltig rad: "${line}".`);
  return { tag: m[1], rest: m[2] ?? '' };
}

export function parseInfo(bytes: Uint8Array): ParsedInfo {
  const lines = splitLines(bytes, 'INFO.SRU');
  let i = 0;
  const expect = (tag: string): string => {
    const { tag: t, rest } = tagOf(lines[i] ?? '');
    if (t !== tag) throw new SruError('SRU-PARSE-04', `INFO.SRU rad ${i + 1}: väntade ${tag}, fick ${t}.`);
    i++;
    return rest;
  };

  expect('#DATABESKRIVNING_START');
  const produkt = expect('#PRODUKT');
  if (produkt !== 'SRU') throw new SruError('SRU-PARSE-05', `#PRODUKT ska vara SRU, fick "${produkt}".`);
  const [date, time] = expect('#SKAPAD').split(' ');
  const programRaw = expect('#PROGRAM');
  const lastSpace = programRaw.lastIndexOf(' ');
  const program = { name: programRaw.slice(0, lastSpace), version: programRaw.slice(lastSpace + 1) };
  const filnamn = expect('#FILNAMN');
  expect('#DATABESKRIVNING_SLUT');
  expect('#MEDIELEV_START');

  const sender: SruSender = { orgNumber: expect('#ORGNR'), name: expect('#NAMN') };
  type OptionalKey = 'address' | 'postalCode' | 'city' | 'contact' | 'email' | 'phone';
  const optional: [string, OptionalKey][] = [
    ['#ADRESS', 'address'], ['#POSTNR', 'postalCode'], ['#POSTORT', 'city'],
    ['#KONTAKT', 'contact'], ['#EMAIL', 'email'], ['#TELEFON', 'phone'],
  ];
  for (const [tag, key] of optional) {
    if (i < lines.length && tagOf(lines[i]).tag === tag) {
      sender[key] = tagOf(lines[i]).rest;
      i++;
    }
  }
  expect('#MEDIELEV_SLUT');
  expect('#FIL_SLUT');
  if (i !== lines.length) throw new SruError('SRU-PARSE-06', 'INFO.SRU: innehåll efter #FIL_SLUT.');
  return { skapad: { date, time }, program, filnamn, sender };
}

export function parseBlanketter(bytes: Uint8Array): SruBlankett[] {
  const lines = splitLines(bytes, 'BLANKETTER.SRU');
  const blanketter: SruBlankett[] = [];
  let i = 0;

  while (i < lines.length) {
    const { tag, rest } = tagOf(lines[i]);
    if (tag === '#FIL_SLUT') {
      if (i !== lines.length - 1) throw new SruError('SRU-PARSE-07', 'Innehåll efter #FIL_SLUT.');
      if (blanketter.length === 0) throw new SruError('SRU-PARSE-08', 'Inga blanketter i filen.');
      return blanketter;
    }
    if (tag !== '#BLANKETT') throw new SruError('SRU-PARSE-09', `Rad ${i + 1}: väntade #BLANKETT, fick ${tag}.`);
    const formCode = rest;
    i++;

    const ident = tagOf(lines[i] ?? '');
    if (ident.tag !== '#IDENTITET') throw new SruError('SRU-PARSE-10', `Blankett ${formCode}: #IDENTITET saknas.`);
    const [idNumber] = ident.rest.split(' ');
    i++;

    let name: string | undefined;
    if (i < lines.length && tagOf(lines[i]).tag === '#NAMN') {
      name = tagOf(lines[i]).rest;
      i++;
    }

    const uppgifter: { fieldCode: string; value: string }[] = [];
    while (i < lines.length && tagOf(lines[i]).tag === '#UPPGIFT') {
      const parts = tagOf(lines[i]).rest;
      const space = parts.indexOf(' ');
      uppgifter.push({ fieldCode: parts.slice(0, space), value: parts.slice(space + 1) });
      i++;
    }

    if (tagOf(lines[i] ?? '').tag !== '#BLANKETTSLUT') {
      throw new SruError('SRU-PARSE-11', `Blankett ${formCode}: #BLANKETTSLUT saknas.`);
    }
    i++;
    blanketter.push({ formCode, idNumber, name, uppgifter });
  }
  throw new SruError('SRU-PARSE-12', 'BLANKETTER.SRU: #FIL_SLUT saknas.');
}
