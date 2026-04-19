import { db } from '../db';
import { format } from 'date-fns';

export async function exportSIE(): Promise<string> {
  const accounts = await db.accounts.toArray();
  const vouchers = await db.vouchers.toArray();
  const transactions = await db.transactions.toArray();

  let sie = '#FLAGGA 0\n';
  sie += '#FORMAT PC8\n';
  sie += '#SIETYP 4\n';
  sie += '#PROGRAM "Lokal Bokföring AI Studio" 1.0\n';
  sie += `#GEN ${format(new Date(), 'yyyyMMdd')}\n`;
  
  // Accounts – include a non-standard #KONTOTYP line so the type survives
  // a round-trip (the standard SIE format has no account-type field).
  for (const acc of accounts) {
    sie += `#KONTO ${acc.id} "${acc.name}"\n`;
    sie += `#KONTOTYP ${acc.id} ${acc.type}\n`;
  }

  // Vouchers
  for (const v of vouchers) {
    const dateStr = v.date.replace(/-/g, '');
    sie += `#VER "" "" ${dateStr} "${v.description}"\n{\n`;
    
    const vTrans = transactions.filter(t => t.voucherId === v.id);
    for (const t of vTrans) {
      sie += `    #TRANS ${t.accountId} {} ${t.amount.toFixed(2)} ""\n`;
    }
    sie += `}\n`;
  }

  return sie;
}

export async function importSIE(fileContent: string): Promise<void> {
  const lines = fileContent.split(/\r?\n/);
  
  let currentVoucherId: number | null = null;

  await db.transaction('rw', db.accounts, db.vouchers, db.transactions, async () => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#KONTOTYP')) {
        // Non-standard extension: override the type set by the #KONTO line above.
        const match = line.match(/#KONTOTYP\s+(\d+)\s+(\w+)/);
        if (match) {
          const id = parseInt(match[1], 10);
          const type = match[2] as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
          await db.accounts.update(id, { type });
        }
      } else if (line.startsWith('#KONTO')) {
        const match = line.match(/#KONTO\s+(\d+)\s+"([^"]+)"/);
        if (match) {
          const id = parseInt(match[1], 10);
          const name = match[2];

          let type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' = 'expense';
          if (id >= 1000 && id <= 1999) type = 'asset';
          else if (id >= 2000 && id <= 2099) type = 'equity';
          else if (id >= 2100 && id <= 2999) type = 'liability';
          else if (id >= 3000 && id <= 3999) type = 'revenue';

          await db.accounts.put({ id, name, type });
        }
      } else if (line.startsWith('#VER')) {
        const match = line.match(/#VER\s+"[^"]*"\s+"[^"]*"\s+(\d{8})\s+"([^"]+)"/);
        if (match) {
          const dateStr = match[1];
          const date = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
          const description = match[2];
          
          currentVoucherId = await db.vouchers.add({
            date,
            description,
            created_at: Date.now()
          });
        }
      } else if (line.startsWith('#TRANS') && currentVoucherId !== null) {
        const match = line.match(/#TRANS\s+(\d+)\s+(?:{[^}]*}\s+|""\s+|)([\d.-]+)/);
        if (match) {
          const accountId = parseInt(match[1], 10);
          const amount = parseFloat(match[2]);
          
          await db.transactions.add({
            voucherId: currentVoucherId,
            accountId,
            amount
          });
        }
      } else if (line === '}') {
        currentVoucherId = null;
      }
    }
  });
}
