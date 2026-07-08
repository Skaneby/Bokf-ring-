// INK2 (aktiebolag) — räkenskapsschema INK2R enligt blankettens officiella
// postnumrering (2.1–2.50 balans, 3.1–3.27 resultat) + skattemässiga
// justeringar (INK2S) för beräkning.
//
// Fältkoder och kontointervall är VERIFIERADE mot BAS kopplingstabell
// "Inkomstdeklaration 2" (BAS 2023) — arkiverad i docs/.
// Specialfall ur tabellen: vissa poster är NETTO-poster med olika fältkod
// beroende på tecken (t.ex. 3.2 → 7411 vid + / 7510 vid −).
// INK2S (4.x) är inte kontomappad och EXPORTERAS INTE — kompletteras i
// e-tjänsten (samma policy som NE:s justeringsrader).

import { Voucher, Transaction } from '../db';
import { NeRow, NeAdjustments } from './declaration';
import { SruPackage, SruUppgift } from './sru';
import { CompanySettings } from './invoice';

export const INK2_FALTKODER_VERIFIED = true;

// P-suffix per beskattningsår — VERIFIERAS mot årets blankett/testtjänsten
// (NE 2025 = P4; INK2 antas följa samma utgåvecykel)
const INK2_FORM_VERSION: Record<number, string> = {};
export const INK2R_FORM_CODE = (taxYear: number) =>
  `INK2R-${taxYear}${INK2_FORM_VERSION[taxYear] ?? 'P4'}`;
export const INK2S_FORM_CODE = (taxYear: number) =>
  `INK2S-${taxYear}${INK2_FORM_VERSION[taxYear] ?? 'P4'}`;

type Range = { from: number; to: number };

// balance-poster ackumuleras t.o.m. året; result-poster avser året.
// 'net' = resultatpost som kan vara +/− med olika fältkod per tecken.
interface Ink2LineDef {
  id: string;          // officiellt postnummer, t.ex. '2.19', '3.1'
  label: string;
  kind: 'asset' | 'liability' | 'revenue' | 'expense' | 'net' | 'manual' | 'computed';
  accounts?: Range[];
  sruCode?: string;      // fältkod (plus-kod för net-poster)
  sruCodeMinus?: string; // fältkod vid negativt värde (net-poster)
}

const r = (from: number, to?: number): Range => ({ from, to: to ?? from });

export const INK2R_LINES: Ink2LineDef[] = [
  // ── Tillgångar ──
  { id: '2.1',  label: 'Koncessioner, patent, licenser, varumärken m.m.', kind: 'asset', sruCode: '7201',
    accounts: [r(1000, 1087), r(1089, 1099)] },
  { id: '2.2',  label: 'Förskott avseende immateriella anläggningstillgångar', kind: 'asset', sruCode: '7202',
    accounts: [r(1088)] },
  { id: '2.3',  label: 'Byggnader och mark', kind: 'asset', sruCode: '7214',
    accounts: [r(1100, 1119), r(1130, 1179), r(1190, 1199)] },
  { id: '2.4',  label: 'Maskiner, inventarier och övriga materiella anläggningstillgångar', kind: 'asset', sruCode: '7215',
    accounts: [r(1200, 1279), r(1290, 1299)] },
  { id: '2.5',  label: 'Förbättringsutgifter på annans fastighet', kind: 'asset', sruCode: '7216',
    accounts: [r(1120, 1129)] },
  { id: '2.6',  label: 'Pågående nyanläggningar och förskott', kind: 'asset', sruCode: '7217',
    accounts: [r(1180, 1189), r(1280, 1289)] },
  { id: '2.7',  label: 'Andelar i koncernföretag', kind: 'asset', sruCode: '7230',
    accounts: [r(1310, 1319)] },
  { id: '2.8',  label: 'Andelar i intresseföretag m.m.', kind: 'asset', sruCode: '7231',
    accounts: [r(1330, 1335), r(1338, 1339)] },
  { id: '2.9',  label: 'Ägarintresse i övriga företag och andra långfristiga värdepapper', kind: 'asset', sruCode: '7233',
    accounts: [r(1350, 1359), r(1336, 1337)] },
  { id: '2.10', label: 'Fordringar hos koncern-/intresseföretag', kind: 'asset', sruCode: '7232',
    accounts: [r(1320, 1329), r(1340, 1345), r(1348, 1349)] },
  { id: '2.11', label: 'Lån till delägare eller närstående', kind: 'asset', sruCode: '7234',
    accounts: [r(1360, 1369)] },
  { id: '2.12', label: 'Övriga långfristiga fordringar', kind: 'asset', sruCode: '7235',
    accounts: [r(1370, 1389), r(1346, 1347)] },
  { id: '2.13', label: 'Råvaror och förnödenheter', kind: 'asset', sruCode: '7241',
    accounts: [r(1410, 1429)] },
  { id: '2.14', label: 'Varor under tillverkning', kind: 'asset', sruCode: '7242',
    accounts: [r(1440, 1449)] },
  { id: '2.15', label: 'Färdiga varor och handelsvaror', kind: 'asset', sruCode: '7243',
    accounts: [r(1450, 1469)] },
  { id: '2.16', label: 'Övriga lagertillgångar', kind: 'asset', sruCode: '7244',
    accounts: [r(1490, 1499)] },
  { id: '2.17', label: 'Pågående arbeten för annans räkning (tillgång)', kind: 'asset', sruCode: '7245',
    accounts: [r(1470, 1479)] },
  { id: '2.18', label: 'Förskott till leverantörer', kind: 'asset', sruCode: '7246',
    accounts: [r(1480, 1489)] },
  { id: '2.19', label: 'Kundfordringar', kind: 'asset', sruCode: '7251',
    accounts: [r(1510, 1559), r(1580, 1589)] },
  { id: '2.20', label: 'Fordringar hos koncern-/intresseföretag (kortfristiga)', kind: 'asset', sruCode: '7252',
    accounts: [r(1560, 1572), r(1574, 1579), r(1660, 1672), r(1674, 1679)] },
  { id: '2.21', label: 'Övriga fordringar (kortfristiga)', kind: 'asset', sruCode: '7261',
    accounts: [r(1573), r(1610, 1619), r(1630, 1659), r(1673), r(1680, 1699)] },
  { id: '2.22', label: 'Upparbetad men ej fakturerad intäkt', kind: 'asset', sruCode: '7262',
    accounts: [r(1620, 1629)] },
  { id: '2.23', label: 'Förutbetalda kostnader och upplupna intäkter', kind: 'asset', sruCode: '7263',
    accounts: [r(1700, 1799)] },
  { id: '2.24', label: 'Andelar i koncernföretag (kortfristiga)', kind: 'asset', sruCode: '7270',
    accounts: [r(1860, 1869)] },
  { id: '2.25', label: 'Övriga kortfristiga placeringar', kind: 'asset', sruCode: '7271',
    accounts: [r(1800, 1859), r(1870, 1899)] },
  { id: '2.26', label: 'Kassa, bank och redovisningsmedel', kind: 'asset', sruCode: '7281',
    accounts: [r(1900, 1999)] },
  { id: 'TS',   label: 'Summa tillgångar', kind: 'computed' },
  // ── Eget kapital och skulder ──
  { id: '2.27', label: 'Bundet eget kapital', kind: 'liability', sruCode: '7301',
    accounts: [r(2080, 2089)] },
  { id: '2.28', label: 'Fritt eget kapital', kind: 'liability', sruCode: '7302',
    accounts: [r(2090, 2099)] },
  { id: '2.29', label: 'Periodiseringsfonder', kind: 'liability', sruCode: '7321',
    accounts: [r(2110, 2139)] },
  { id: '2.30', label: 'Ackumulerade överavskrivningar', kind: 'liability', sruCode: '7322',
    accounts: [r(2150, 2159)] },
  { id: '2.31', label: 'Övriga obeskattade reserver', kind: 'liability', sruCode: '7323',
    accounts: [r(2160, 2199)] },
  { id: '2.32', label: 'Avsättningar för pensioner (tryggandelagen)', kind: 'liability', sruCode: '7331',
    accounts: [r(2210, 2219)] },
  { id: '2.33', label: 'Övriga avsättningar för pensioner', kind: 'liability', sruCode: '7332',
    accounts: [r(2230, 2239)] },
  { id: '2.34', label: 'Övriga avsättningar', kind: 'liability', sruCode: '7333',
    accounts: [r(2220, 2229), r(2240, 2299)] },
  { id: '2.35', label: 'Obligationslån', kind: 'liability', sruCode: '7350',
    accounts: [r(2310, 2329)] },
  { id: '2.36', label: 'Checkräkningskredit (långfristig)', kind: 'liability', sruCode: '7351',
    accounts: [r(2330, 2339)] },
  { id: '2.37', label: 'Övriga skulder till kreditinstitut (långfristiga)', kind: 'liability', sruCode: '7352',
    accounts: [r(2340, 2359)] },
  { id: '2.38', label: 'Skulder till koncern-/intresseföretag (långfristiga)', kind: 'liability', sruCode: '7353',
    accounts: [r(2360, 2372), r(2374, 2379)] },
  { id: '2.39', label: 'Övriga långfristiga skulder', kind: 'liability', sruCode: '7354',
    accounts: [r(2373), r(2380, 2399)] },
  { id: '2.40', label: 'Checkräkningskredit (kortfristig)', kind: 'liability', sruCode: '7360',
    accounts: [r(2480, 2489)] },
  { id: '2.41', label: 'Övriga skulder till kreditinstitut (kortfristiga)', kind: 'liability', sruCode: '7361',
    accounts: [r(2410, 2419)] },
  { id: '2.42', label: 'Förskott från kunder', kind: 'liability', sruCode: '7362',
    accounts: [r(2420, 2429)] },
  { id: '2.43', label: 'Pågående arbeten för annans räkning (skuld)', kind: 'liability', sruCode: '7363',
    accounts: [r(2430, 2439)] },
  { id: '2.44', label: 'Fakturerad men ej upparbetad intäkt', kind: 'liability', sruCode: '7364',
    accounts: [r(2450, 2459)] },
  { id: '2.45', label: 'Leverantörsskulder', kind: 'liability', sruCode: '7365',
    accounts: [r(2440, 2449)] },
  { id: '2.46', label: 'Växelskulder', kind: 'liability', sruCode: '7366',
    accounts: [r(2492)] },
  { id: '2.47', label: 'Skulder till koncern-/intresseföretag (kortfristiga)', kind: 'liability', sruCode: '7367',
    accounts: [r(2460, 2472), r(2474, 2479), r(2860, 2872), r(2874, 2879)] },
  { id: '2.48', label: 'Övriga kortfristiga skulder (inkl. moms)', kind: 'liability', sruCode: '7369',
    accounts: [r(2473), r(2490, 2491), r(2493, 2499), r(2600, 2859), r(2873), r(2880, 2899)] },
  { id: '2.49', label: 'Skatteskulder', kind: 'liability', sruCode: '7368',
    accounts: [r(2500, 2599)] },
  { id: '2.50', label: 'Upplupna kostnader och förutbetalda intäkter', kind: 'liability', sruCode: '7370',
    accounts: [r(2900, 2999)] },
  { id: 'ES',   label: 'Summa eget kapital och skulder (inkl. årets resultat)', kind: 'computed' },
  // ── Resultaträkning ──
  { id: '3.1',  label: 'Nettoomsättning', kind: 'revenue', sruCode: '7410',
    accounts: [r(3000, 3799)] },
  { id: '3.2',  label: 'Förändring av lager av produkter i arbete m.m.', kind: 'net',
    sruCode: '7411', sruCodeMinus: '7510',
    accounts: [r(4900, 4909), r(4930, 4959), r(4970, 4979), r(4990, 4999)] },
  { id: '3.3',  label: 'Aktiverat arbete för egen räkning', kind: 'revenue', sruCode: '7412',
    accounts: [r(3800, 3899)] },
  { id: '3.4',  label: 'Övriga rörelseintäkter', kind: 'revenue', sruCode: '7413',
    accounts: [r(3900, 3999)] },
  { id: '3.5',  label: 'Råvaror och förnödenheter', kind: 'expense', sruCode: '7511',
    accounts: [r(4000, 4799), r(4910, 4929)] },
  { id: '3.6',  label: 'Handelsvaror', kind: 'expense', sruCode: '7512',
    accounts: [r(4960, 4969), r(4980, 4989)] },
  { id: '3.7',  label: 'Övriga externa kostnader', kind: 'expense', sruCode: '7513',
    accounts: [r(5000, 6999)] },
  { id: '3.8',  label: 'Personalkostnader', kind: 'expense', sruCode: '7514',
    accounts: [r(7000, 7699)] },
  { id: '3.9',  label: 'Av- och nedskrivningar av anläggningstillgångar', kind: 'expense', sruCode: '7515',
    accounts: [r(7700, 7739), r(7750, 7789), r(7800, 7899)] },
  { id: '3.10', label: 'Nedskrivningar av omsättningstillgångar utöver normala', kind: 'expense', sruCode: '7516',
    accounts: [r(7740, 7749), r(7790, 7799)] },
  { id: '3.11', label: 'Övriga rörelsekostnader', kind: 'expense', sruCode: '7517',
    accounts: [r(7900, 7999)] },
  { id: '3.12', label: 'Resultat från andelar i koncernföretag', kind: 'net',
    sruCode: '7414', sruCodeMinus: '7518',
    accounts: [r(8000, 8069), r(8090, 8099)] },
  { id: '3.13', label: 'Resultat från andelar i intresseföretag m.m.', kind: 'net',
    sruCode: '7415', sruCodeMinus: '7519',
    accounts: [r(8100, 8112), r(8114, 8117), r(8119, 8122), r(8124, 8132), r(8134, 8169), r(8190, 8199)] },
  { id: '3.14', label: 'Resultat från övriga företag med ägarintresse', kind: 'net',
    sruCode: '7423', sruCodeMinus: '7530',
    accounts: [r(8113), r(8118), r(8123), r(8133)] },
  { id: '3.15', label: 'Resultat från övriga anläggningstillgångar', kind: 'net',
    sruCode: '7416', sruCodeMinus: '7520',
    accounts: [r(8200, 8269), r(8290, 8299)] },
  { id: '3.16', label: 'Övriga ränteintäkter och liknande', kind: 'revenue', sruCode: '7417',
    accounts: [r(8300, 8369), r(8390, 8399)] },
  { id: '3.17', label: 'Nedskrivningar av finansiella tillgångar', kind: 'expense', sruCode: '7521',
    accounts: [r(8070, 8089), r(8170, 8189), r(8270, 8289), r(8370, 8389)] },
  { id: '3.18', label: 'Räntekostnader och liknande', kind: 'expense', sruCode: '7522',
    accounts: [r(8400, 8499)] },
  { id: '3.19', label: 'Lämnade koncernbidrag', kind: 'expense', sruCode: '7524',
    accounts: [r(8830, 8839)] },
  { id: '3.20', label: 'Mottagna koncernbidrag', kind: 'revenue', sruCode: '7419',
    accounts: [r(8820, 8829)] },
  // 8810 kan avse båda riktningarna — mappas inte automatiskt (justeras manuellt)
  { id: '3.21', label: 'Återföring av periodiseringsfond', kind: 'revenue', sruCode: '7420',
    accounts: [r(8819)] },
  { id: '3.22', label: 'Avsättning till periodiseringsfond', kind: 'expense', sruCode: '7525',
    accounts: [r(8811)] },
  { id: '3.23', label: 'Förändring av överavskrivningar', kind: 'net',
    sruCode: '7421', sruCodeMinus: '7526',
    accounts: [r(8850, 8859)] },
  { id: '3.24', label: 'Övriga bokslutsdispositioner', kind: 'net',
    sruCode: '7422', sruCodeMinus: '7527',
    accounts: [r(8840, 8849), r(8860, 8899)] },
  { id: '3.25', label: 'Skatt på årets resultat', kind: 'expense', sruCode: '7528',
    accounts: [r(8900, 8989)] },
  // 3.26/3.27: beräknas — vinst → 7450, förlust → 7550 (899x exkluderas överallt)
  { id: 'RR',   label: 'Årets resultat (3.26 vinst / 3.27 förlust)', kind: 'computed',
    sruCode: '7450', sruCodeMinus: '7550' },
];

export const INK2S_LINES: Ink2LineDef[] = [
  { id: 'J1', label: 'Bokfört resultat (överskott + / underskott −)', kind: 'computed' },
  { id: 'J2', label: 'Bokförda kostnader som inte ska dras av', kind: 'manual' },
  { id: 'J3', label: 'Bokförda intäkter som inte ska tas upp', kind: 'manual' },
  { id: 'J4', label: 'Övriga skattemässiga justeringar (+/−)', kind: 'manual' },
  { id: 'JR', label: 'Skattemässigt resultat', kind: 'computed' },
];

const RESULT_IDS = INK2R_LINES
  .filter(l => ['revenue', 'expense', 'net'].includes(l.kind))
  .map(l => l.id);
const ASSET_IDS = INK2R_LINES.filter(l => l.kind === 'asset').map(l => l.id);
const EQLIAB_IDS = INK2R_LINES.filter(l => l.kind === 'liability').map(l => l.id);

// Bygger alla INK2-rader (INK2R + INK2S) för ett beskattningsår.
export function buildInk2Rows(
  vouchers: Voucher[],
  transactions: Transaction[],
  taxYear: number,
  adjustments: NeAdjustments = {},
): NeRow[] {
  const voucherYear = new Map(vouchers.map(v => [v.id!, parseInt(v.date.slice(0, 4), 10)]));

  const balCum = new Map<number, number>();
  const balYear = new Map<number, number>();
  for (const t of transactions) {
    const year = voucherYear.get(t.voucherId);
    if (year === undefined || year > taxYear) continue;
    balCum.set(t.accountId, (balCum.get(t.accountId) ?? 0) + t.amount);
    if (year === taxYear) balYear.set(t.accountId, (balYear.get(t.accountId) ?? 0) + t.amount);
  }

  const sumRanges = (map: Map<number, number>, ranges: Range[]) => {
    let total = 0;
    for (const [accountId, saldo] of map) {
      if (ranges.some(rg => accountId >= rg.from && accountId <= rg.to)) total += saldo;
    }
    return total;
  };

  const rows: NeRow[] = [...INK2R_LINES, ...INK2S_LINES].map(def => {
    let auto = 0;
    if (def.accounts) {
      const isBalance = def.kind === 'asset' || def.kind === 'liability';
      const saldo = sumRanges(isBalance ? balCum : balYear, def.accounts);
      // Kreditpositiva: skulder/EK, intäkter och nettoposter (kreditöverskott = +)
      const creditPositive = def.kind !== 'asset' && def.kind !== 'expense';
      auto = Math.round(creditPositive ? -saldo : saldo);
    }
    const adj = adjustments[def.id];
    const displayKind: NeRow['kind'] =
      def.kind === 'asset' || def.kind === 'liability' ? 'expense'
      : def.kind === 'net' ? 'revenue'
      : def.kind;
    return {
      id: def.id, label: def.label, kind: displayKind, sruCode: def.sruCode,
      auto,
      value: def.kind === 'computed' ? 0 : (adj ? Math.round(adj.value) : auto),
      adjusted: def.kind !== 'computed' && adj !== undefined,
      note: adj?.note,
    };
  });

  const get = (id: string) => rows.find(x => x.id === id)!;
  const defOf = (id: string) => [...INK2R_LINES, ...INK2S_LINES].find(d => d.id === id)!;
  const sumOf = (ids: string[]) => ids.reduce((s, id) => {
    const kind = defOf(id).kind;
    const sign = kind === 'expense' ? -1 : 1; // revenue/net bidrar med tecken, expense dras av
    return s + sign * get(id).value;
  }, 0);

  const arets = sumOf(RESULT_IDS);
  get('RR').value = arets; get('RR').auto = arets;
  get('TS').value = ASSET_IDS.reduce((s, id) => s + get(id).value, 0);
  get('TS').auto  = get('TS').value;
  get('ES').value = EQLIAB_IDS.reduce((s, id) => s + get(id).value, 0) + arets;
  get('ES').auto  = get('ES').value;

  get('J1').value = arets; get('J1').auto = arets;
  const jr = arets + get('J2').value - get('J3').value + get('J4').value;
  get('JR').value = jr; get('JR').auto = jr;

  return rows;
}

// ── SRU-paket ─────────────────────────────────────────────────────────────────

export interface Ink2SruInput {
  taxYear: number;
  rows: NeRow[];
  company: CompanySettings;
  createdAt: { date: string; time: string };
  program: { name: string; version: string };
}

// Endast INK2R exporteras (verifierade koder). INK2S saknar kontomappade
// fältkoder och kompletteras i e-tjänsten.
export function buildInk2SruPackage(input: Ink2SruInput): SruPackage {
  const { taxYear, rows, company, createdAt, program } = input;

  const uppgifter: SruUppgift[] = [
    { fieldCode: '7011', value: `${taxYear}-01-01` },
    { fieldCode: '7012', value: `${taxYear}-12-31` },
  ];
  for (const def of INK2R_LINES) {
    if (!def.sruCode) continue;
    const row = rows.find(x => x.id === def.id);
    if (!row || row.value === 0) continue;
    if (row.value < 0 && def.sruCodeMinus) {
      uppgifter.push({ fieldCode: def.sruCodeMinus, value: String(Math.abs(row.value)) });
    } else {
      uppgifter.push({ fieldCode: def.sruCode, value: String(row.value) });
    }
  }

  return {
    createdAt,
    program,
    sender: {
      orgNumber: company.orgnr,
      name: company.name,
      ...(company.email ? { email: company.email } : {}),
    },
    blanketter: [
      {
        formCode: INK2R_FORM_CODE(taxYear),
        idNumber: company.orgnr,
        name: company.name,
        uppgifter,
      },
    ],
  };
}
