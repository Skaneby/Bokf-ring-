import { db, Account, Voucher, Transaction } from '../db';

export interface BackupData {
  version: number;
  exported_at: string;
  accounts: Account[];
  vouchers: Voucher[];
  transactions: Transaction[];
}

export async function buildBackupData(): Promise<BackupData> {
  const [accounts, vouchers, transactions] = await Promise.all([
    db.accounts.toArray(),
    db.vouchers.toArray(),
    db.transactions.toArray(),
  ]);
  return { version: 1, exported_at: new Date().toISOString(), accounts, vouchers, transactions };
}

export async function applyBackupData(data: BackupData): Promise<{ vouchers: number; transactions: number }> {
  if (
    !Array.isArray(data.accounts) ||
    !Array.isArray(data.vouchers) ||
    !Array.isArray(data.transactions)
  ) {
    throw new Error('Ogiltig backup-fil – saknar accounts, vouchers eller transactions.');
  }
  await db.transaction('rw', db.accounts, db.vouchers, db.transactions, async () => {
    await Promise.all([db.transactions.clear(), db.vouchers.clear(), db.accounts.clear()]);
    await Promise.all([
      db.accounts.bulkAdd(data.accounts),
      db.vouchers.bulkAdd(data.vouchers),
      db.transactions.bulkAdd(data.transactions),
    ]);
  });
  return { vouchers: data.vouchers.length, transactions: data.transactions.length };
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackupData();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bokforing-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<{ vouchers: number; transactions: number }> {
  const data: BackupData = JSON.parse(await file.text());
  return applyBackupData(data);
}
