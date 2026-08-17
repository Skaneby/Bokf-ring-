import {
  db, Account, Voucher, Transaction, Invoice, Declaration, Setting, Customer,
  getIdentity, setIdentity, newIdentity,
} from '../db';
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

// Inställningsnycklar som INTE hör till bokföringen och därför INTE sparas i
// filen/backupen: filhandtaget (maskinspecifikt, ej serialiserbart),
// databasidentiteten (sparas separat på toppnivå) och AI-nyckeln (hemlighet
// som inte ska följa med en delad bokföringsfil).
const SETTINGS_NOT_IN_BACKUP = new Set(['bokforingsfil', 'dbIdentity', 'ai']);

export interface BackupData {
  version: number;
  exported_at: string;
  // Databasidentitet — gör att fil och webbläsare kan verifieras som SAMMA bokföring
  dbId?: string;
  revision?: number;
  modifiedAt?: string;
  bokforingName?: string;
  accounts: Account[];
  vouchers: Voucher[];
  transactions: Transaction[];
  attachments?: BackupAttachment[];
  invoices?: Invoice[];         // fakturor (inkl. arkiverad HTML, nummerserie)
  declarations?: Declaration[]; // NE/INK2-justeringar + inlämningssteg
  settings?: Setting[];         // företagsuppgifter + FAKTURAMALL + nästa nummer
  customers?: Customer[];       // återanvändbara kunduppgifter
}

export async function buildBackupData(): Promise<BackupData> {
  const [accounts, vouchers, transactions, attachments, invoices, declarations, settings, customers, identity] =
    await Promise.all([
      db.accounts.toArray(),
      db.vouchers.toArray(),
      db.transactions.toArray(),
      db.attachments.toArray(),
      db.invoices.toArray(),
      db.declarations.toArray(),
      db.settings.toArray(),
      db.customers.toArray(),
      getIdentity(),
    ]);

  const backupSettings = settings.filter(row => !SETTINGS_NOT_IN_BACKUP.has(row.key));
  const name = (backupSettings.find(r => r.key === 'company')?.value as { name?: string } | undefined)?.name
    ?? (settings.find(r => r.key === 'bokforingsfil')?.value as { name?: string } | undefined)?.name;

  return {
    version: 3,
    exported_at: new Date().toISOString(),
    dbId: identity?.id,
    revision: identity?.revision,
    modifiedAt: identity?.modifiedAt,
    bokforingName: name,
    accounts, vouchers, transactions,
    attachments: attachments.map(a => ({
      voucherId: a.voucherId,
      name: a.name,
      type: a.type,
      created_at: a.created_at,
      dataBase64: bufferToBase64(a.data),
    })),
    invoices,
    declarations,
    settings: backupSettings,
    customers,
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
      if (Array.isArray(data.invoices)) await db.invoices.bulkAdd(data.invoices);
      if (Array.isArray(data.declarations)) await db.declarations.bulkAdd(data.declarations);
      if (Array.isArray(data.customers)) await db.customers.bulkAdd(data.customers);
      // Företagsuppgifter + fakturamall återställs; lokala nycklar (AI-nyckel,
      // filhandtag, identitet) lämnas orörda genom att bara skriva de sparade.
      if (Array.isArray(data.settings)) {
        for (const row of data.settings) {
          if (!SETTINGS_NOT_IN_BACKUP.has(row.key)) await db.settings.put(row);
        }
      }
    },
  );
  // Adoptera databasens identitet från filen — annars ny (äldre filer utan ID)
  if (data.dbId) {
    await setIdentity({
      id: data.dbId,
      revision: data.revision ?? 0,
      modifiedAt: data.modifiedAt ?? new Date().toISOString(),
    });
  } else {
    await newIdentity();
  }
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
