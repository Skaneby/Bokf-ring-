import Dexie, { type Table } from 'dexie';

export interface Account {
  id: number; // Account number (e.g., 1910)
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  vatCode?: string;
}

export interface Voucher {
  id?: number;
  date: string; // YYYY-MM-DD
  description: string;
  created_at: number;
}

export interface Transaction {
  id?: number;
  voucherId: number;
  accountId: number;
  amount: number; // Positive = Debit, Negative = Credit
}

export interface InvoiceRow {
  description: string;
  qty: number;
  unitPrice: number; // exkl. moms
  vatRate: 0 | 6 | 12 | 25;
}

// Bokföringsmetod: 'faktura' bokförs vid skapande (1510), 'kontant' först vid betalning
export type InvoiceMethod = 'faktura' | 'kontant';
export type InvoiceStatus = 'obetald' | 'betald' | 'makulerad';

export interface Invoice {
  id?: number;
  number: number; // Löpande fakturanummer — obruten serie, återanvänds aldrig
  date: string;
  dueDate: string;
  customerName: string;
  customerAddress?: string;
  customerOrgnr?: string;
  customerEmail?: string;
  customerReference?: string; // "Er referens" — kundens kontaktperson
  rows: InvoiceRow[];
  method: InvoiceMethod;
  status: InvoiceStatus;
  paidDate?: string;
  createdVoucherId?: number; // verifikat bokfört vid skapande (fakturametoden)
  paidVoucherId?: number;    // verifikat bokfört vid betalning
  // Arkiverad fakturafil: HTML:n exakt som när fakturan skapades — ändras
  // aldrig även om företagsuppgifter/mall ändras senare
  documentHtml?: string;
  created_at: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

// Kvittobilaga kopplad till ett verifikat. Lagras som ArrayBuffer (inte Blob)
// — klonas säkert av IndexedDB i alla miljöer inkl. testernas fake-indexeddb.
export interface Attachment {
  id?: number;
  voucherId: number;
  name: string;
  type: string;   // MIME, t.ex. image/jpeg eller application/pdf
  size: number;   // bytes
  data: ArrayBuffer;
  created_at: number;
}

// Manuella justeringar per blankettrad — bokförda värden räknas alltid om
export interface DeclarationField {
  value: number;
  note?: string;
}

// Inlämningsspårning — appen kan inte läsa status hos Skatteverket (Spår A);
// stegen bekräftas av användaren enligt inlämningsguiden
export interface DeclarationSubmission {
  exportedAt?: string;  // SRU-filer genererade och nedladdade
  uploadedAt?: string;  // användaren bekräftar uppladdning i filöverföringstjänsten
  signedAt?: string;    // användaren bekräftar signering på Mina sidor
}

export type DeclarationType = 'NE' | 'INK2';

export interface Declaration {
  id?: number;
  taxYear: number;              // beskattningsår
  type: DeclarationType;        // NE (enskild firma) eller INK2 (aktiebolag)
  fields: Record<string, DeclarationField>; // lineId ('R1' …) → justering
  status: 'draft' | 'klar';
  submission?: DeclarationSubmission;
  updated_at: number;
}

// Återanvändbar kunddata — sparas automatiskt vid varje faktura och kan väljas
// i fakturablanketten för att slippa fylla i samma uppgifter igen.
export interface Customer {
  id?: number;
  name: string;
  address?: string;
  orgnr?: string;
  email?: string;
  reference?: string;
  lastUsed: number; // unix-ms — styr sorteringsordningen i träfflistan
}

export class AccountingDB extends Dexie {
  accounts!: Table<Account>;
  vouchers!: Table<Voucher>;
  transactions!: Table<Transaction>;
  invoices!: Table<Invoice>;
  settings!: Table<Setting>;
  declarations!: Table<Declaration>;
  attachments!: Table<Attachment>;
  customers!: Table<Customer>;

  constructor() {
    super('AccountingDB');
    this.version(1).stores({
      accounts: 'id, type',
      vouchers: '++id, date',
      transactions: '++id, voucherId, accountId'
    });
    // v2: fakturamodul — invoices + settings (företagsuppgifter, nummerserie, mall)
    this.version(2).stores({
      accounts: 'id, type',
      vouchers: '++id, date',
      transactions: '++id, voucherId, accountId',
      invoices: '++id, number, status, date',
      settings: 'key'
    });
    // v3: deklarationsmodul — manuella justeringar per beskattningsår
    this.version(3).stores({
      accounts: 'id, type',
      vouchers: '++id, date',
      transactions: '++id, voucherId, accountId',
      invoices: '++id, number, status, date',
      settings: 'key',
      declarations: '++id, taxYear'
    });
    // v4: kvittobilagor per verifikat
    this.version(4).stores({
      accounts: 'id, type',
      vouchers: '++id, date',
      transactions: '++id, voucherId, accountId',
      invoices: '++id, number, status, date',
      settings: 'key',
      declarations: '++id, taxYear',
      attachments: '++id, voucherId'
    });
    // v5: kundregister — återanvändbara kunduppgifter i fakturablanketten
    this.version(5).stores({
      accounts: 'id, type',
      vouchers: '++id, date',
      transactions: '++id, voucherId, accountId',
      invoices: '++id, number, status, date',
      settings: 'key',
      declarations: '++id, taxYear',
      attachments: '++id, voucherId',
      customers: '++id, name, lastUsed'
    });
  }
}

export const db = new AccountingDB();

// Standardkontoplan (BAS) för enskild firma. Ett väl avvägt urval av de
// vanligaste kontona — tillräckligt för att bokföra de flesta affärshändelser
// utan att kontoplanen blir oöverskådlig. Användaren kan lägga till egna konton
// i Kontoplan-fliken. Kontonummer och kontoarter följer BAS-kontoplanen.
export const defaultAccounts: Account[] = [
  // ── Tillgångar (1xxx) ──────────────────────────────────────────────
  { id: 1510, name: 'Kundfordringar', type: 'asset' },
  { id: 1910, name: 'Kassa', type: 'asset' },
  { id: 1930, name: 'Företagskonto / Bank', type: 'asset' },

  // ── Eget kapital (2xxx) ────────────────────────────────────────────
  { id: 2010, name: 'Eget kapital', type: 'equity' },
  { id: 2013, name: 'Egna uttag', type: 'equity' },
  { id: 2018, name: 'Egna insättningar', type: 'equity' },
  { id: 2019, name: 'Årets resultat', type: 'equity' },

  // ── Skulder & moms (2xxx) ──────────────────────────────────────────
  { id: 2510, name: 'Skatteskulder (F-skatt)', type: 'liability' },
  { id: 2514, name: 'Beräknade egenavgifter', type: 'liability' },
  { id: 2610, name: 'Utgående moms, 25%', type: 'liability', vatCode: '10' },
  { id: 2620, name: 'Utgående moms, 12%', type: 'liability', vatCode: '11' },
  { id: 2630, name: 'Utgående moms, 6%', type: 'liability', vatCode: '12' },
  { id: 2640, name: 'Ingående moms', type: 'asset', vatCode: '48' },
  { id: 2650, name: 'Redovisningskonto för moms', type: 'liability' },

  // ── Omvänd skattskyldighet / förvärvsmoms (2xxx) ───────────────────
  // Beräknad utgående moms på tjänsteförvärv från utlandet (EU + utanför EU)
  { id: 2614, name: 'Utgående moms omvänd skattskyldighet, 25%', type: 'liability', vatCode: '30' },
  { id: 2624, name: 'Utgående moms omvänd skattskyldighet, 12%', type: 'liability', vatCode: '31' },
  { id: 2634, name: 'Utgående moms omvänd skattskyldighet, 6%', type: 'liability', vatCode: '32' },
  // Beräknad utgående moms på varuförvärv från annat EU-land
  { id: 2615, name: 'Utgående moms varuförvärv EU, 25%', type: 'liability', vatCode: '30' },
  { id: 2625, name: 'Utgående moms varuförvärv EU, 12%', type: 'liability', vatCode: '31' },
  { id: 2635, name: 'Utgående moms varuförvärv EU, 6%', type: 'liability', vatCode: '32' },
  // Beräknad utgående moms på varuimport från land utanför EU → ruta 60/61/62
  { id: 2616, name: 'Utgående moms varuimport, 25%', type: 'liability', vatCode: '60' },
  { id: 2626, name: 'Utgående moms varuimport, 12%', type: 'liability', vatCode: '61' },
  { id: 2636, name: 'Utgående moms varuimport, 6%', type: 'liability', vatCode: '62' },
  // Beräknad ingående moms på förvärv från utlandet (avdragsgill → ruta 48)
  { id: 2645, name: 'Beräknad ingående moms på förvärv från utlandet', type: 'asset', vatCode: '48' },

  // ── Intäkter (3xxx) ────────────────────────────────────────────────
  { id: 3000, name: 'Försäljning (25% moms)', type: 'revenue', vatCode: '05' },
  { id: 3001, name: 'Försäljning (12% moms)', type: 'revenue', vatCode: '06' },
  { id: 3002, name: 'Försäljning (6% moms)', type: 'revenue', vatCode: '07' },
  { id: 3040, name: 'Försäljning (momsfri)', type: 'revenue' },
  { id: 3540, name: 'Fakturerade resekostnader', type: 'revenue' },
  { id: 3990, name: 'Övriga rörelseintäkter', type: 'revenue' },

  // ── Varor & material (4xxx) ────────────────────────────────────────
  { id: 4000, name: 'Inköp av varor och material', type: 'expense' },

  // ── Förvärv från utlandet — omvänd skattskyldighet (4xxx) ──────────
  // Varuinköp från annat EU-land (unionsinternt förvärv) → momsruta 20
  { id: 4515, name: 'Inköp av varor från annat EU-land, 25%', type: 'expense', vatCode: '20' },
  { id: 4516, name: 'Inköp av varor från annat EU-land, 12%', type: 'expense', vatCode: '20' },
  { id: 4517, name: 'Inköp av varor från annat EU-land, 6%',  type: 'expense', vatCode: '20' },
  { id: 4518, name: 'Inköp av varor från annat EU-land, momsfri', type: 'expense', vatCode: '20' },
  // Tjänsteinköp från annat EU-land → momsruta 21
  { id: 4531, name: 'Inköp av tjänster från annat EU-land, 25%', type: 'expense', vatCode: '21' },
  { id: 4532, name: 'Inköp av tjänster från annat EU-land, 12%', type: 'expense', vatCode: '21' },
  { id: 4533, name: 'Inköp av tjänster från annat EU-land, 6%',  type: 'expense', vatCode: '21' },
  // Tjänsteinköp från land utanför EU → momsruta 22
  { id: 4535, name: 'Inköp av tjänster från land utanför EU, 25%', type: 'expense', vatCode: '22' },
  { id: 4536, name: 'Inköp av tjänster från land utanför EU, 12%', type: 'expense', vatCode: '22' },
  { id: 4537, name: 'Inköp av tjänster från land utanför EU, 6%',  type: 'expense', vatCode: '22' },
  // Import av varor från land utanför EU → momsruta 50 (beskattningsunderlag = tullvärde + tull)
  { id: 4545, name: 'Import av varor, 25% moms', type: 'expense', vatCode: '50' },
  { id: 4546, name: 'Import av varor, 12% moms', type: 'expense', vatCode: '50' },
  { id: 4547, name: 'Import av varor, 6% moms',  type: 'expense', vatCode: '50' },

  // ── Lokalkostnader (5xxx) ──────────────────────────────────────────
  { id: 5010, name: 'Lokalhyra', type: 'expense' },
  { id: 5020, name: 'El för belysning', type: 'expense' },
  { id: 5060, name: 'Städning och renhållning', type: 'expense' },
  { id: 5090, name: 'Övriga lokalkostnader', type: 'expense' },

  // ── Förbrukningsinventarier & material (5xxx) ──────────────────────
  { id: 5410, name: 'Förbrukningsinventarier', type: 'expense' },
  { id: 5420, name: 'Programvaror', type: 'expense' },
  { id: 5460, name: 'Förbrukningsmaterial', type: 'expense' },

  // ── Frakt & transport (5xxx) ───────────────────────────────────────
  { id: 5710, name: 'Frakter och transporter', type: 'expense' },

  // ── Resekostnader (58xx) ───────────────────────────────────────────
  { id: 5800, name: 'Resekostnader', type: 'expense' },
  { id: 5810, name: 'Biljetter (tåg, flyg, buss)', type: 'expense' },
  { id: 5831, name: 'Hotell och logi', type: 'expense' },

  // ── Reklam & PR (59xx) ─────────────────────────────────────────────
  { id: 5910, name: 'Annonsering', type: 'expense' },

  // ── Representation (60xx) ──────────────────────────────────────────
  { id: 6071, name: 'Representation, avdragsgill', type: 'expense' },
  { id: 6072, name: 'Representation, ej avdragsgill', type: 'expense' },

  // ── Kontor, tele, försäkring & förvaltning (6xxx) ──────────────────
  { id: 6110, name: 'Kontorsmateriel', type: 'expense' },
  { id: 6211, name: 'Fast telefoni', type: 'expense' },
  { id: 6212, name: 'Mobiltelefon', type: 'expense' },
  { id: 6230, name: 'Datakommunikation (internet)', type: 'expense' },
  { id: 6250, name: 'Porto', type: 'expense' },
  { id: 6310, name: 'Företagsförsäkringar', type: 'expense' },
  { id: 6530, name: 'Redovisningstjänster', type: 'expense' },
  { id: 6540, name: 'IT-tjänster', type: 'expense' },
  { id: 6550, name: 'Konsultarvoden', type: 'expense' },
  { id: 6570, name: 'Bankkostnader', type: 'expense' },
  { id: 6970, name: 'Tidningar, tidskrifter och facklitteratur', type: 'expense' },
  { id: 6981, name: 'Föreningsavgifter, avdragsgilla', type: 'expense' },
  { id: 6991, name: 'Övriga externa kostnader, avdragsgilla', type: 'expense' },
  { id: 6992, name: 'Övriga externa kostnader, ej avdragsgilla', type: 'expense' },

  // ── Finansiella poster (8xxx) ──────────────────────────────────────
  { id: 8310, name: 'Ränteintäkter', type: 'revenue' },
  { id: 8410, name: 'Räntekostnader', type: 'expense' },

  // ── Skatt & årsavslut (8xxx) ───────────────────────────────────────
  { id: 8422, name: 'Egenavgifter', type: 'expense' },
  // 8999 används enbart av årsavslutet (resultatdisposition) och exkluderas
  // ur resultaträkningen — se lib/yearEnd.ts
  { id: 8999, name: 'Årets resultat (avslut)', type: 'expense' },
];

export async function initializeDb(): Promise<{ hasData: boolean }> {
  const accountCount = await db.accounts.count();

  if (accountCount === 0) {
    await db.accounts.bulkAdd(defaultAccounts);
  } else {
    // Backfyll standardkonton som saknas i en äldre databas (konton tillagda i
    // en senare version). ENDAST konton som inte redan finns läggs till — egna
    // konton och namnändringar på befintliga konton rörs aldrig. Detta ersätter
    // den tidigare handpatchade PATCH_ACCOUNTS-listan: defaultAccounts är nu
    // enda källan till standardkontoplanen, så nya konton når alltid befintliga
    // användare utan att man glömmer uppdatera en parallell lista.
    const existing = new Set((await db.accounts.toArray()).map(a => a.id));
    const missing  = defaultAccounts.filter(a => !existing.has(a.id));
    if (missing.length) await db.accounts.bulkAdd(missing);
  }

  // Varje bokföringsdatabas har en identitet (id + revision) — krävs för
  // att kunna verifiera att fil och webbläsare är SAMMA databas i synk
  if (!(await getIdentity())) await newIdentity();

  return { hasData: accountCount > 0 };
}

// Tömmer HELA bokföringen inför "Byt bokföring" / återställning: alla
// datatabeller + företagsinställningarna (mall, nummerserie, uppgifter).
// AI-nyckel och onboarding-flagga behålls (hör till användaren, inte bokföringen).
// Filhandtag och identitet hanteras av anroparen (clearBokforingsfil/clearIdentity).
export async function wipeBokforing(): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.vouchers, db.transactions, db.attachments,
     db.invoices, db.declarations, db.settings, db.customers],
    async () => {
      await Promise.all([
        db.transactions.clear(), db.vouchers.clear(), db.accounts.clear(),
        db.attachments.clear(), db.invoices.clear(), db.declarations.clear(),
        db.customers.clear(),
      ]);
      await db.settings.delete('company'); // uppgifter/mall/nummerserie nollställs
    },
  );
}

// ── Databasidentitet ──────────────────────────────────────────────────────────
// Unikt ID skapas när bokföringen skapas och följer den för alltid.
// Revisionen räknas upp vid varje sparning till fil — gör det möjligt att
// upptäcka att en fil och webbläsarens kopia glidit isär.

export interface DbIdentity {
  id: string;         // UUID — samma i filen och i webbläsaren = samma bokföring
  revision: number;   // ökar vid varje filsparning
  modifiedAt: string; // ISO-tidsstämpel för senaste sparning/ändring
}

const IDENTITY_KEY = 'dbIdentity';

export async function getIdentity(): Promise<DbIdentity | null> {
  const row = await db.settings.get(IDENTITY_KEY);
  return (row?.value as DbIdentity | undefined) ?? null;
}

export async function setIdentity(identity: DbIdentity): Promise<void> {
  await db.settings.put({ key: IDENTITY_KEY, value: identity });
}

// UUID v4 med fallback — crypto.randomUUID finns först i Safari 15.4.
// Äldre iOS/Safari skulle annars kasta och krascha initieringen.
export function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* faller igenom till reservlösningen */ }
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = [...b].map(x => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

export async function newIdentity(): Promise<DbIdentity> {
  const identity: DbIdentity = {
    id: genId(),
    revision: 0,
    modifiedAt: new Date().toISOString(),
  };
  await setIdentity(identity);
  return identity;
}

export async function clearIdentity(): Promise<void> {
  await db.settings.delete(IDENTITY_KEY);
}

// Räknas upp vid varje sparning till bokföringsfilen
export async function bumpIdentity(): Promise<DbIdentity> {
  const current = (await getIdentity()) ?? await newIdentity();
  const bumped: DbIdentity = {
    ...current,
    revision: current.revision + 1,
    modifiedAt: new Date().toISOString(),
  };
  await setIdentity(bumped);
  return bumped;
}

// Jämför webbläsarens identitet med en fils — grunden för synkvarningarna
export type DbCompare =
  | 'same'         // samma databas, filen är lika ny eller nyare → öppna
  | 'local-newer'  // samma databas men webbläsaren har nyare ändringar → fråga
  | 'different'    // en ANNAN bokföring → varna innan webbläsarens kopia ersätts
  | 'no-local'     // webbläsaren är tom → öppna utan frågor
  | 'legacy-file'; // äldre fil utan identitet → öppna och stämpla vid nästa sparning

export function compareDb(
  local: DbIdentity | null,
  file: { dbId?: string; revision?: number },
): DbCompare {
  if (!file.dbId) return 'legacy-file';
  if (!local) return 'no-local';
  if (local.id !== file.dbId) return 'different';
  return (file.revision ?? 0) >= local.revision ? 'same' : 'local-newer';
}
