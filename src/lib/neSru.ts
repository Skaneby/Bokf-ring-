// Mappningslager: NE-blankettrader (domän) → SruPackage (exportformat).
// Detta är den ENDA filen som känner till både NeRow och SRU-modellen —
// se docs/deklarationsmodul-spec.md §4.2 (domän ≠ export).

import { SruPackage } from './sru';
import { NeRow, NE_LINES } from './declaration';
import { CompanySettings } from './invoice';

// FÄLTKODER: bokföringsdelen (B1–B16, R1–R11) är VERIFIERAD mot BAS
// kopplingstabell "NE — förenklat årsbokslut" (B1=7200 … R11=7440).
// 7011/7012 (räkenskapsårets början/slut) är belagda i Skatteverkets exempel.
// Skattemässiga justeringar (R12–R48) saknar verifierade koder och
// EXPORTERAS INTE — de kompletteras i Skatteverkets e-tjänst efter uppladdning.
// Blankettkodens årsversion (P-suffix) ska fortsatt kontrolleras i testtjänsten.
export const NE_FALTKODER_VERIFIED = true;

export const NE_FORM_CODE = (taxYear: number) => `NE-${taxYear}P1`; // VERIFIERAS: årsversion/P-suffix

const FIELD_PERIOD_FROM = '7011'; // räkenskapsårets början
const FIELD_PERIOD_TO   = '7012'; // räkenskapsårets slut

// Koderna bor i blankettdefinitionen (NE_LINES) — kan aldrig hamna ur synk
const NE_LINE_CODE: Record<string, string> = Object.fromEntries(
  NE_LINES.filter(l => l.sruCode).map(l => [l.id, l.sruCode!]),
);

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
