// ─────────────────────────────────────────────────────────────────────────────
// Testdata-seed: fyller HELA appen med en sammanhängande årsbokföring (2025) för
// en fiktiv enskild firma. Täcker alla funktioner så att momsrapport, NE-bilaga
// och SRU-export får realistiska värden — tänkt att användas för test mot
// Skatteverkets testtjänst (filöverföring).
//
// Deterministisk (inga Date.now/Math.random) → identiskt resultat varje gång,
// vilket krävs för reproducerbara testkörningar.
//
// Använd via seedDatabase() (t.ex. knappen "Fyll med testdata" i Säkerhetskopiering)
// eller buildSeedBackup() för att skriva en .bokforing.json att importera.
// ─────────────────────────────────────────────────────────────────────────────

import { defaultAccounts, Voucher, Transaction, Invoice } from './db';
import { BackupData, BackupAttachment, applyBackupData } from './lib/backup';
import { reverseChargeRows, ReverseKind } from './lib/vat';
import { CompanySettings, DEFAULT_COMPANY } from './lib/invoice';

// Fast tidsstämpel (2025-01-01 00:00 UTC) — created_at behöver bara vara stabilt
const BASE_TS = 1735689600000;

// 1×1 transparent PNG — en liten kvittobilaga så bilagefunktionen populeras
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface Line { accountId: number; amount: number } // +debet / −kredit

// Fiktiv enskild firma. orgnr = giltigt (Luhn) test-personnummer — byt till DITT
// tilldelade test-personnummer innan du lämnar in mot Skatteverkets testtjänst.
export const SEED_COMPANY: CompanySettings = {
  ...DEFAULT_COMPANY,
  name: 'Exempelfirman (testdata)',
  orgnr: '19121212-1212',
  momsnr: 'SE191212121201',
  address: 'Storgatan 1\n111 22 Stockholm',
  email: 'test@exempelfirman.se',
  phone: '070-000 00 00',
  bankgiro: '123-4567',
  contactPerson: 'Anna Andersson',
  approvedForFskatt: true,
  nextInvoiceNumber: 3,
};

export function buildSeedBackup(): BackupData {
  const vouchers: Voucher[] = [];
  const transactions: Transaction[] = [];
  let vid = 0;
  let tid = 0;

  // Lägger till ett verifikat och kontrollerar att det balanserar (dubbel bokföring)
  function add(date: string, description: string, lines: Line[]): number {
    const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    if (Math.abs(sum) > 0.01) {
      throw new Error(`Seed-verifikat "${description}" balanserar inte (differens ${sum} kr)`);
    }
    vid += 1;
    vouchers.push({ id: vid, date, description, created_at: BASE_TS + vid });
    for (const l of lines) {
      tid += 1;
      transactions.push({ id: tid, voucherId: vid, accountId: l.accountId, amount: l.amount });
    }
    return vid;
  }

  // Omvänd skattskyldighet/import: återanvänder samma logik som momshjälpen
  function reverse(date: string, description: string, net: number, rate: 6 | 12 | 25, kind: ReverseKind) {
    const rows = reverseChargeRows(net, rate, kind);
    add(date, description, rows.map(r => ({ accountId: r.accountId, amount: r.debit > 0 ? r.debit : -r.credit })));
  }

  // ── Intäkter (alla momssatser + momsfritt) ──────────────────────────────────
  add('2025-01-15', 'Konsultarvode kund A',        [{ accountId: 1930, amount: 125000 }, { accountId: 3000, amount: -100000 }, { accountId: 2610, amount: -25000 }]);
  add('2025-02-10', 'Försäljning trycksaker 12%',  [{ accountId: 1930, amount: 11200 },  { accountId: 3001, amount: -10000 },  { accountId: 2620, amount: -1200 }]);
  add('2025-03-05', 'Försäljning bok 6%',          [{ accountId: 1930, amount: 5300 },   { accountId: 3002, amount: -5000 },   { accountId: 2630, amount: -300 }]);
  add('2025-03-20', 'Momsfri försäljning',         [{ accountId: 1930, amount: 8000 },   { accountId: 3040, amount: -8000 }]);

  // ── Inköp med ingående moms + momsfritt ─────────────────────────────────────
  const kMat = add('2025-01-20', 'Kontorsmateriel',            [{ accountId: 6110, amount: 800 },    { accountId: 2640, amount: 200 },    { accountId: 1930, amount: -1000 }]);
  add('2025-02-01', 'Programvarulicens',            [{ accountId: 5420, amount: 4000 },   { accountId: 2640, amount: 1000 },   { accountId: 1930, amount: -5000 }]);
  add('2025-02-15', 'Representationslunch',         [{ accountId: 6071, amount: 400 },    { accountId: 2640, amount: 100 },    { accountId: 1930, amount: -500 }]);
  add('2025-04-10', 'Tågresa till kund (6%)',       [{ accountId: 5800, amount: 943.40 }, { accountId: 2640, amount: 56.60 },  { accountId: 1930, amount: -1000 }]);
  add('2025-04-11', 'Hotellnatt (12%)',             [{ accountId: 5831, amount: 892.86 }, { accountId: 2640, amount: 107.14 }, { accountId: 1930, amount: -1000 }]);
  add('2025-05-01', 'Företagsförsäkring (momsfri)', [{ accountId: 6310, amount: 3000 },   { accountId: 1930, amount: -3000 }]);
  add('2025-06-01', 'Bankavgift',                   [{ accountId: 6570, amount: 600 },    { accountId: 1930, amount: -600 }]);

  // ── Omvänd skattskyldighet (utland) — alla fyra lägena ──────────────────────
  reverse('2025-03-01', 'Molntjänst från Irland (omvänd moms)',      5000, 25, 'eu-service');
  reverse('2025-03-02', 'Konsulttjänst från USA (omvänd moms)',      2000, 25, 'non-eu-service');
  reverse('2025-04-01', 'Varuinköp från Tyskland (omvänd moms)',     8000, 25, 'eu-goods');
  reverse('2025-05-15', 'Import av varor från Kina (tullräkning)',   6000, 25, 'non-eu-goods');

  // ── Ägartransaktioner & skatt ───────────────────────────────────────────────
  add('2025-06-30', 'Eget uttag',                   [{ accountId: 2013, amount: 20000 }, { accountId: 1930, amount: -20000 }]);
  add('2025-07-05', 'Egen insättning',              [{ accountId: 1930, amount: 15000 }, { accountId: 2018, amount: -15000 }]);
  add('2025-07-12', 'F-skatt inbetalning',          [{ accountId: 2510, amount: 12000 }, { accountId: 1930, amount: -12000 }]);
  add('2025-12-31', 'Avsättning egenavgifter',      [{ accountId: 8422, amount: 30000 }, { accountId: 2514, amount: -30000 }]);

  // ── Finansiella poster ──────────────────────────────────────────────────────
  add('2025-09-01', 'Ränteintäkt bankkonto',        [{ accountId: 1930, amount: 150 },   { accountId: 8310, amount: -150 }]);
  add('2025-10-01', 'Räntekostnad företagslån',     [{ accountId: 8410, amount: 400 },   { accountId: 1930, amount: -400 }]);

  // ── Ej avdragsgilla kostnader (kräver manuell återläggning i NE) ─────────────
  add('2025-08-01', 'Förseningsavgift (ej avdragsgill)',   [{ accountId: 6992, amount: 1000 }, { accountId: 1930, amount: -1000 }]);
  add('2025-08-15', 'Representation ej avdragsgill',       [{ accountId: 6072, amount: 300 },  { accountId: 1930, amount: -300 }]);

  // ── Fakturor (populerar Fakturor-fliken; intäkten ligger i verifikaten ovan) ─
  const invoices: Invoice[] = [
    {
      id: 1, number: 1, date: '2025-01-15', dueDate: '2025-02-14',
      customerName: 'Kund AB', customerOrgnr: '556000-0167', customerReference: 'Erik Beställare',
      rows: [{ description: 'Konsulttjänst januari', qty: 1, unitPrice: 100000, vatRate: 25 }],
      method: 'faktura', status: 'betald', paidDate: '2025-02-10', created_at: BASE_TS + 100,
    },
    {
      id: 2, number: 2, date: '2025-06-01', dueDate: '2025-07-01',
      customerName: 'Beställaren HB', customerReference: 'Lisa Inköp',
      rows: [{ description: 'Rådgivning (10 tim)', qty: 10, unitPrice: 1000, vatRate: 25 }],
      method: 'faktura', status: 'obetald', created_at: BASE_TS + 200,
    },
  ];

  // ── Kvittobilaga på kontorsmaterialverifikatet ──────────────────────────────
  const attachments: BackupAttachment[] = [
    { voucherId: kMat, name: 'kvitto-kontorsmateriel.png', type: 'image/png', created_at: BASE_TS + 300, dataBase64: TINY_PNG_BASE64 },
  ];

  return {
    version: 3,
    exported_at: '2025-12-31T23:59:59.000Z',
    dbId: '5eed0000-0000-4000-8000-000000000001',
    revision: 1,
    modifiedAt: '2025-12-31T23:59:59.000Z',
    bokforingName: SEED_COMPANY.name,
    accounts: defaultAccounts,
    vouchers,
    transactions,
    attachments,
    invoices,
    declarations: [],
    settings: [
      { key: 'company', value: SEED_COMPANY },
      { key: 'onboardingDone', value: true },
    ],
  };
}

// Ersätter nuvarande bokföring med seed-datan (via samma väg som JSON-import).
export async function seedDatabase(): Promise<{ vouchers: number; transactions: number }> {
  return applyBackupData(buildSeedBackup());
}
