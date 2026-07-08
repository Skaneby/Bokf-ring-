import { db, Account, Voucher, Transaction } from '../db';
import { bufferToBase64, base64ToBuffer } from './attachments';

// v2: kvittobilagor följer med som base64. v1-backuper (utan attachments)
// återställs fortsatt utan fel — bilagetabellen töms då bara.
export interface BackupAttachment {
  voucherId: number;
  name: string;
  type: string;
  created_at: number;
  dataBase64: string;
}

export interface BackupData {
  version: number;
  exported_at: string;
  accounts: Account[];
  vouchers: Voucher[];
  transactions: Transaction[];
  attachments?: BackupAttachment[];
}

export async function buildBackupData(): Promise<BackupData> {
  const [accounts, vouchers, transactions, attachments] = await Promise.all([
    db.accounts.toArray(),
    db.vouchers.toArray(),
    db.transactions.toArray(),
    db.attachments.toArray(),
  ]);
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    accounts, vouchers, transactions,
    attachments: attachments.map(a => ({
      voucherId: a.voucherId,
      name: a.name,
      type: a.type,
      created_at: a.created_at,
      dataBase64: bufferToBase64(a.data),
    })),
  };
}

export async function applyBackupData(data: BackupData): Promise<{ vouchers: number; transactions: number }> {
  if (
    !Array.isArray(data.accounts) ||
    !Array.isArray(data.vouchers) ||
    !Array.isArray(data.transactions)
  ) {
    throw new Error('Ogiltig backup-fil – saknar accounts, vouchers eller transactions.');
  }
  await db.transaction('rw', db.accounts, db.vouchers, db.transactions, db.attachments, async () => {
    await Promise.all([
      db.transactions.clear(), db.vouchers.clear(), db.accounts.clear(), db.attachments.clear(),
    ]);
    await Promise.all([
      db.accounts.bulkAdd(data.accounts),
      db.vouchers.bulkAdd(data.vouchers),
      db.transactions.bulkAdd(data.transactions),
    ]);
    if (Array.isArray(data.attachments)) {
      await db.attachments.bulkAdd(data.attachments.map(a => {
        const buf = base64ToBuffer(a.dataBase64);
        return {
          voucherId: a.voucherId, name: a.name, type: a.type,
          size: buf.byteLength, data: buf, created_at: a.created_at,
        };
      }));
    }
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
