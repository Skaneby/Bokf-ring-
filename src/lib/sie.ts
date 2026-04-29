import { db } from '../db';
import { format } from 'date-fns';

// CP437 (PC8) → Unicode for characters 0x80–0xFF
const CP437: Record<number, string> = {
  0x80:'Ç',0x81:'ü',0x82:'é',0x83:'â',0x84:'ä',0x85:'à',0x86:'å',0x87:'ç',
  0x88:'ê',0x89:'ë',0x8A:'è',0x8B:'ï',0x8C:'î',0x8D:'ì',0x8E:'Ä',0x8F:'Å',
  0x90:'É',0x91:'æ',0x92:'Æ',0x93:'ô',0x94:'ö',0x95:'ò',0x96:'û',0x97:'ù',
  0x98:'ÿ',0x99:'Ö',0x9A:'Ü',0x9B:'¢',0x9C:'£',0x9D:'¥',0x9E:'₧',0x9F:'ƒ',
  0xA0:'á',0xA1:'í',0xA2:'ó',0xA3:'ú',0xA4:'ñ',0xA5:'Ñ',0xA6:'ª',0xA7:'º',
};

export function decodeSIEBuffer(buf: ArrayBuffer | Buffer): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let out = '';
  for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : (CP437[b] ?? String.fromCharCode(b));
  return out;
}

export async function exportSIE(): Promise<string> {
  const accounts = await db.accounts.toArray();
  const vouchers = await db.vouchers.toArray();
  const transactions = await db.transactions.toArray();

  let sie = '#FLAGGA 0\n';
  sie += '#FORMAT PC8\n';
  sie += '#SIETYP 4\n';
  sie += '#PROGRAM "Lokal Bokföring" 1.0\n';
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

export async function importSIE(fileContent: string, mode: 'merge' | 'replace' = 'merge'): Promise<void> {
  const lines = fileContent.split(/\r?\n/);

  let currentVoucherId: number | null = null;

  await db.transaction('rw', db.accounts, db.vouchers, db.transactions, async () => {
    if (mode === 'replace') {
      await db.transactions.clear();
      await db.vouchers.clear();
      await db.accounts.clear();
    }

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
          // 8900-8999: year-end closing accounts (Årets resultat etc) → equity, not expense
          else if (id >= 8900 && id <= 8999) type = 'equity';

          await db.accounts.put({ id, name, type });
        }
      } else if (line.startsWith('#VER')) {
        // Handles both quoted ("" "") and bare (A 1) series/number fields
        const match = line.match(/#VER\s+(?:"[^"]*"|\S+)\s+(?:"[^"]*"|\S+)\s+(\d{8})\s*(?:"([^"]*)")?/);
        if (match) {
          const dateStr = match[1];
          const date = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
          const description = match[2] ?? '';
          
          currentVoucherId = await db.vouchers.add({
            date,
            description,
            created_at: Date.now()
          });
        }
      } else if (line.startsWith('#TRANS') && currentVoucherId !== null) {
        const match = line.match(/#TRANS\s+(\d+)\s+(?:\{[^}]*\}\s*|"[^"]*"\s*)(-?\d+(?:\.\d+)?)/);
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
