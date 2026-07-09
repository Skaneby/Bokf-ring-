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

export class AccountingDB extends Dexie {
  accounts!: Table<Account>;
  vouchers!: Table<Voucher>;
  transactions!: Table<Transaction>;
  invoices!: Table<Invoice>;
  settings!: Table<Setting>;
  declarations!: Table<Declaration>;
  attachments!: Table<Attachment>;

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
  }
}

export const db = new AccountingDB();

// Basic BAS 2026 setup
export const defaultAccounts: Account[] = [
  { id: 1510, name: 'Kundfordringar', type: 'asset' },
  { id: 1910, name: 'Kassa', type: 'asset' },
  { id: 1930, name: 'Företagskonto / Bank', type: 'asset' },
  { id: 2010, name: 'Eget kapital', type: 'equity' },
  { id: 2013, name: 'Egna uttag', type: 'equity' },
  { id: 2018, name: 'Egna insättningar', type: 'equity' },
  { id: 2019, name: 'Årets resultat', type: 'equity' },
  { id: 2510, name: 'Skatteskulder (F-skatt)', type: 'liability' },
  { id: 2514, name: 'Beräknade egenavgifter', type: 'liability' },
  { id: 2610, name: 'Utgående moms, 25%', type: 'liability', vatCode: '10' },
  { id: 2620, name: 'Utgående moms, 12%', type: 'liability', vatCode: '11' },
  { id: 2630, name: 'Utgående moms, 6%', type: 'liability', vatCode: '12' },
  { id: 2640, name: 'Ingående moms', type: 'asset', vatCode: '48' },
  { id: 2650, name: 'Redovisningskonto för moms', type: 'liability' },
  { id: 3000, name: 'Försäljning (25% moms)', type: 'revenue', vatCode: '05' },
  { id: 3001, name: 'Försäljning (12% moms)', type: 'revenue', vatCode: '06' },
  { id: 3002, name: 'Försäljning (6% moms)', type: 'revenue', vatCode: '07' },
  { id: 3040, name: 'Försäljning (momsfri)', type: 'revenue' },
  { id: 4000, name: 'Inköp av varor', type: 'expense' },
  { id: 5010, name: 'Lokalhyra', type: 'expense' },
  { id: 5410, name: 'Förbrukningsinventarier', type: 'expense' },
  { id: 5420, name: 'Programvaror', type: 'expense' },
  { id: 6110, name: 'Kontorsmateriel', type: 'expense' },
  { id: 6530, name: 'Redovisningstjänster', type: 'expense' },
  { id: 6570, name: 'Bankkostnader', type: 'expense' },
  { id: 8422, name: 'Egenavgifter', type: 'expense' },
  // 8999 används enbart av årsavslutet (resultatdisposition) och exkluderas
  // ur resultaträkningen — se lib/yearEnd.ts
  { id: 8999, name: 'Årets resultat (avslut)', type: 'expense' },
];

// Accounts added after initial release — patched into existing databases on startup
const PATCH_ACCOUNTS: Account[] = [
  { id: 1510, name: 'Kundfordringar', type: 'asset' },
  { id: 2013, name: 'Egna uttag', type: 'equity' },
  { id: 2018, name: 'Egna insättningar', type: 'equity' },
  { id: 2019, name: 'Årets resultat', type: 'equity' },
  { id: 2510, name: 'Skatteskulder (F-skatt)', type: 'liability' },
  { id: 2514, name: 'Beräknade egenavgifter', type: 'liability' },
  { id: 8422, name: 'Egenavgifter', type: 'expense' },
  { id: 8999, name: 'Årets resultat (avslut)', type: 'expense' },
];

export async function initializeDb(): Promise<{ hasData: boolean }> {
  const accountCount = await db.accounts.count();

  if (accountCount === 0) {
    await db.accounts.bulkAdd(defaultAccounts);
  } else {
    // Silently add any accounts introduced after the user's initial setup
    for (const acc of PATCH_ACCOUNTS) {
      if (!(await db.accounts.get(acc.id))) await db.accounts.put(acc);
    }
  }

  // Varje bokföringsdatabas har en identitet (id + revision) — krävs för
  // att kunna verifiera att fil och webbläsare är SAMMA databas i synk
  if (!(await getIdentity())) await newIdentity();

  return { hasData: accountCount > 0 };
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

export async function newIdentity(): Promise<DbIdentity> {
  const identity: DbIdentity = {
    id: crypto.randomUUID(),
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
