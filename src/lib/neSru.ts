// Mappningslager: NE-blankettrader (domän) → SruPackage (exportformat).
// Detta är den ENDA filen som känner till både NeRow och SRU-modellen —
// se docs/deklarationsmodul-spec.md §4.2 (domän ≠ export).

import { SruPackage } from './sru';
import { NeRow } from './declaration';
import { CompanySettings } from './invoice';

// ⚠️ FÄLTKODSTABELL — PRELIMINÄR.
// 7011/7012 (räkenskapsårets början/slut) är belagda i Skatteverkets exempel.
// R-radernas koder nedan är PLATSHÅLLARE enligt schemat R{n} → 7100+n och
// MÅSTE ersättas med verifierade koder ur SKV 269 / aktuell fältkodslista
// innan skarp inlämning. UI:t spärrar exporten bakom en bekräftelse och
// hänvisar till Skatteverkets testtjänst så länge VERIFIED är false.
export const NE_FALTKODER_VERIFIED = false;

export const NE_FORM_CODE = (taxYear: number) => `NE-${taxYear}P1`; // VERIFIERAS: årsversion/P-suffix

const FIELD_PERIOD_FROM = '7011'; // räkenskapsårets början (belagd)
const FIELD_PERIOD_TO   = '7012'; // räkenskapsårets slut (belagd)

// R{n} → 7100+n — PLATSHÅLLARE (VERIFIERAS)
const NE_LINE_CODE: Record<string, string> = {
  R1: '7101', R2: '7102', R3: '7103', R4: '7104', R5: '7105',
  R6: '7106', R7: '7107', R8: '7108', R9: '7109', R10: '7110',
  R11: '7111', R12: '7112', R13: '7113', R43: '7143',
  R47: '7147', R48: '7148',
};

export interface NeSruInput {
  taxYear: number;
  rows: NeRow[];
  company: CompanySettings;    // uppgiftslämnare; orgNumber = personnummer för EF
  createdAt: { date: string; time: string }; // fryses av anroparen
  program: { name: string; version: string };
}

// Bygger ett SruPackage från NE-raderna. Rader med värde 0 utelämnas
// (ingen #UPPGIFT-rad). Endast rader med känd fältkod tas med.
export function buildNeSruPackage(input: NeSruInput): SruPackage {
  const { taxYear, rows, company, createdAt, program } = input;

  const uppgifter = [
    { fieldCode: FIELD_PERIOD_FROM, value: `${taxYear}-01-01` },
    { fieldCode: FIELD_PERIOD_TO,   value: `${taxYear}-12-31` },
    ...rows
      .filter(r => NE_LINE_CODE[r.id] !== undefined && r.value !== 0)
      .map(r => ({ fieldCode: NE_LINE_CODE[r.id], value: String(r.value) })),
  ];

  return {
    createdAt,
    program,
    sender: {
      orgNumber: company.orgnr,
      name: company.name,
      ...(company.address ? { address: company.address.split('\n')[0] } : {}),
      ...(company.email ? { email: company.email } : {}),
      ...(company.phone ? { phone: company.phone } : {}),
    },
    blanketter: [
      {
        formCode: NE_FORM_CODE(taxYear),
        idNumber: company.orgnr, // enskild firma: personnummer (12 siffror krävs)
        name: company.name,
        uppgifter,
      },
    ],
  };
}
