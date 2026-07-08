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
  rows: InvoiceRow[];
  method: InvoiceMethod;
  status: InvoiceStatus;
  paidDate?: string;
  createdVoucherId?: number; // verifikat bokfört vid skapande (fakturametoden)
  paidVoucherId?: number;    // verifikat bokfört vid betalning
  created_at: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export class AccountingDB extends Dexie {
  accounts!: Table<Account>;
  vouchers!: Table<Voucher>;
  transactions!: Table<Transaction>;
  invoices!: Table<Invoice>;
  settings!: Table<Setting>;

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
];

// Accounts added after initial release — patched into existing databases on startup
const PATCH_ACCOUNTS: Account[] = [
  { id: 1510, name: 'Kundfordringar', type: 'asset' },
  { id: 2013, name: 'Egna uttag', type: 'equity' },
  { id: 2018, name: 'Egna insättningar', type: 'equity' },
  { id: 2510, name: 'Skatteskulder (F-skatt)', type: 'liability' },
  { id: 2514, name: 'Beräknade egenavgifter', type: 'liability' },
  { id: 8422, name: 'Egenavgifter', type: 'expense' },
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

  return { hasData: accountCount > 0 };
}
