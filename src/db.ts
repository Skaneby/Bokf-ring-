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

export interface Setting {
  key: string;
  value: string;
}

export class AccountingDB extends Dexie {
  accounts!: Table<Account>;
  vouchers!: Table<Voucher>;
  transactions!: Table<Transaction>;
  settings!: Table<Setting>;

  constructor() {
    super('AccountingDB');
    this.version(1).stores({
      accounts: 'id, type',
      vouchers: '++id, date',
      transactions: '++id, voucherId, accountId'
    });
    this.version(2).stores({
      accounts: 'id, type',
      vouchers: '++id, date',
      transactions: '++id, voucherId, accountId',
      settings: 'key'
    });
  }
}

export const db = new AccountingDB();

// Basic BAS 2026 setup
export const defaultAccounts: Account[] = [
  { id: 1910, name: 'Kassa', type: 'asset' },
  { id: 1930, name: 'Företagskonto / Bank', type: 'asset' },
  { id: 2010, name: 'Eget kapital', type: 'equity' },
  { id: 2013, name: 'Egna uttag', type: 'equity' },
  { id: 2018, name: 'Egna insättningar', type: 'equity' },
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
];

export async function initializeDb() {
  const count = await db.accounts.count();
  if (count === 0) {
    await db.accounts.bulkAdd(defaultAccounts);
  }
}
