import 'fake-indexeddb/auto';
import { db, initializeDb } from './db';
import { exportSIE, importSIE } from './lib/sie';

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, extra = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${extra ? ' — ' + extra : ''}`);
    failed++;
  }
}

function near(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

async function addVoucher(
  date: string,
  description: string,
  lines: { accountId: number; amount: number }[]
) {
  // amount positive = debit, negative = credit
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (!near(sum, 0)) throw new Error(`Voucher "${description}" does not balance (diff ${sum})`);

  await db.transaction('rw', db.vouchers, db.transactions, async () => {
    const voucherId = await db.vouchers.add({ date, description, created_at: Date.now() });
    for (const line of lines) {
      await db.transactions.add({ voucherId, accountId: line.accountId, amount: line.amount });
    }
  });
}

async function getBalances() {
  const accounts = await db.accounts.toArray();
  const transactions = await db.transactions.toArray();

  const map = new Map<number, number>();
  for (const t of transactions) map.set(t.accountId, (map.get(t.accountId) ?? 0) + t.amount);

  let assets = 0, liabilities = 0, revenue = 0, expenses = 0;
  for (const acc of accounts) {
    const bal = map.get(acc.id) ?? 0;
    if (acc.type === 'asset')                               assets      += bal;
    if (acc.type === 'liability' || acc.type === 'equity')  liabilities -= bal; // credit = neg
    if (acc.type === 'revenue')                             revenue     -= bal; // credit = neg
    if (acc.type === 'expense')                             expenses    += bal;
  }
  return { assets, liabilities, revenue, expenses, netIncome: revenue - expenses };
}

// ─── main ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log(' Lokal Bokföring – fullständigt testsvit');
  console.log('════════════════════════════════════════════════════════\n');

  // ── setup ──────────────────────────────────────────────────────────────
  await db.transactions.clear();
  await db.vouchers.clear();
  await db.accounts.clear();
  await initializeDb();

  const accountCount = await db.accounts.count();
  assert(accountCount > 0, 'Kontoplanen initialiseras med standardkonton');
  assert(accountCount === 21, `Exakt 21 standardkonton (fick ${accountCount})`);

  // ═══════════════════════════════════════════════════════════════════════
  // 10 VERIFIKATIONER – realistiska affärshändelser
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── Bokför 10 verifikationer ──────────────────────────\n');

  // 1. Ägaren sätter in startkapital
  await addVoucher('2026-01-01', 'Ägarinsättning startkapital', [
    { accountId: 1930, amount:  50000 },   // Bank Debet
    { accountId: 2018, amount: -50000 },   // Egna insättningar Kredit
  ]);
  console.log('  Ver 1 – Ägarinsättning bokförd');

  // 2. Försäljning med 25 % moms
  await addVoucher('2026-01-05', 'Försäljning tjänst, 25% moms', [
    { accountId: 1930, amount:  12500 },   // Bank Debet
    { accountId: 3000, amount: -10000 },   // Försäljning 25% moms Kredit
    { accountId: 2610, amount:  -2500 },   // Utgående moms 25% Kredit
  ]);
  console.log('  Ver 2 – Försäljning m. moms bokförd');

  // 3. Inköp av handelsvaror med 25 % ingående moms
  await addVoucher('2026-01-08', 'Inköp av varor', [
    { accountId: 4000, amount:  5000 },    // Inköp Debet
    { accountId: 2640, amount:  1250 },    // Ingående moms Debet
    { accountId: 1930, amount: -6250 },    // Bank Kredit
  ]);
  console.log('  Ver 3 – Varukostnad bokförd');

  // 4. Lokalhyra (ingen moms)
  await addVoucher('2026-01-10', 'Lokalhyra januari', [
    { accountId: 5010, amount:  8000 },    // Lokalhyra Debet
    { accountId: 1930, amount: -8000 },    // Bank Kredit
  ]);
  console.log('  Ver 4 – Lokalhyra bokförd');

  // 5. Programvaruinköp med 25 % moms
  await addVoucher('2026-01-12', 'Inköp programvara', [
    { accountId: 5420, amount:  3000 },    // Programvaror Debet
    { accountId: 2640, amount:   750 },    // Ingående moms Debet
    { accountId: 1930, amount: -3750 },    // Bank Kredit
  ]);
  console.log('  Ver 5 – Programvara bokförd');

  // 6. Kontorsmaterial med 25 % moms
  await addVoucher('2026-01-15', 'Kontorsmaterial', [
    { accountId: 6110, amount:   500 },    // Kontorsmateriel Debet
    { accountId: 2640, amount:   125 },    // Ingående moms Debet
    { accountId: 1930, amount:  -625 },    // Bank Kredit
  ]);
  console.log('  Ver 6 – Kontorsmaterial bokförd');

  // 7. Bankavgift (ingen moms)
  await addVoucher('2026-01-20', 'Bankavgifter januari', [
    { accountId: 6570, amount:   150 },    // Bankkostnader Debet
    { accountId: 1930, amount:  -150 },    // Bank Kredit
  ]);
  console.log('  Ver 7 – Bankavgift bokförd');

  // 8. Redovisningstjänst med 25 % moms
  await addVoucher('2026-01-22', 'Redovisningstjänst', [
    { accountId: 6530, amount:  2000 },    // Redovisningstjänster Debet
    { accountId: 2640, amount:   500 },    // Ingående moms Debet
    { accountId: 1930, amount: -2500 },    // Bank Kredit
  ]);
  console.log('  Ver 8 – Redovisningstjänst bokförd');

  // 9. Momsfri försäljning
  await addVoucher('2026-01-25', 'Momsfri försäljning', [
    { accountId: 1930, amount:  5000 },    // Bank Debet
    { accountId: 3040, amount: -5000 },    // Försäljning momsfri Kredit
  ]);
  console.log('  Ver 9 – Momsfri försäljning bokförd');

  // 10. Ägaruttag
  await addVoucher('2026-01-31', 'Eget uttag', [
    { accountId: 2013, amount:  3000 },    // Egna uttag Debet
    { accountId: 1930, amount: -3000 },    // Bank Kredit
  ]);
  console.log('  Ver 10 – Ägaruttag bokförd');

  // ═══════════════════════════════════════════════════════════════════════
  // RÄKNEKONTROLL
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── Balansräkning & resultat ──────────────────────────\n');

  const voucherCount = await db.vouchers.count();
  const txCount = await db.transactions.count();
  assert(voucherCount === 10, `10 verifikationer sparade (fick ${voucherCount})`);
  // rows: 2+3+3+2+3+3+2+3+2+2 = 25
  assert(txCount === 25, `25 transaktionsrader sparade (fick ${txCount})`);

  const { assets, liabilities, revenue, expenses, netIncome } = await getBalances();

  // Expected values
  // Bank 1930 = 50000+12500-6250-8000-3750-625-150-2500+5000-3000 = 43225
  // Ingående moms 2640 = 1250+750+125+500 = 2625
  // Total tillgångar = 43225 + 2625 = 45850
  assert(near(assets, 45850), `Tillgångar = 45 850 kr (fick ${assets.toFixed(2)})`);

  // Skulder & EK:
  //   Egna insättningar 2018 = 50000 (kredit → positiv)
  //   Egna uttag 2013 = 3000 (debet → negativ i EK) → -3000
  //   Utgående moms 25% 2610 = 2500 (kredit → positiv skuld)
  //   Summa = 49500
  assert(near(liabilities, 49500), `Skulder & EK = 49 500 kr (fick ${liabilities.toFixed(2)})`);

  // Intäkter = 10000 + 5000 = 15000
  assert(near(revenue, 15000), `Intäkter = 15 000 kr (fick ${revenue.toFixed(2)})`);

  // Kostnader = 5000+8000+3000+500+150+2000 = 18650
  assert(near(expenses, 18650), `Kostnader = 18 650 kr (fick ${expenses.toFixed(2)})`);

  // Nettoresultat = 15000-18650 = -3650 (förlust)
  assert(near(netIncome, -3650), `Nettoresultat = -3 650 kr (fick ${netIncome.toFixed(2)})`);

  // Balansprincip: Tillgångar = Skulder+EK + Nettoresultat
  const balanced = near(assets, liabilities + netIncome);
  assert(balanced,
    `Balansräkningskontroll: Tillgångar (${assets}) = Skulder+EK (${liabilities}) + Resultat (${netIncome})`,
    `diff=${(assets - liabilities - netIncome).toFixed(2)}`
  );

  // ═══════════════════════════════════════════════════════════════════════
  // VALIDERINGSLOGIK (speglar VoucherEntry.tsx handleSubmit)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── Valideringsregler ─────────────────────────────────\n');

  // Obalanserad verifikation ska avvisas
  const balanceOk = (lines: { amount: number }[]) =>
    near(lines.reduce((s, l) => s + l.amount, 0), 0);

  assert(!balanceOk([{ amount: 1000 }, { amount: -999 }]),
    'Obalanserad verifikation identifieras korrekt');
  assert(balanceOk([{ amount: 500 }, { amount: -500 }]),
    'Balanserad verifikation godkänns');

  // Minst 2 rader krävs
  const validRowCount = (rows: { accountId: number; debit: string; credit: string }[]) =>
    rows.filter(r => r.accountId && (r.debit || r.credit)).length;

  assert(validRowCount([{ accountId: 1930, debit: '100', credit: '' }]) < 2,
    'En rad räcker inte – krav på minst 2 rader');
  assert(
    validRowCount([
      { accountId: 1930, debit: '100', credit: '' },
      { accountId: 2018, debit: '',    credit: '100' }
    ]) >= 2,
    'Två rader uppfyller minimikravet'
  );

  // ═══════════════════════════════════════════════════════════════════════
  // SIE-EXPORT
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── SIE4-export ───────────────────────────────────────\n');

  const sieData = await exportSIE();

  assert(sieData.includes('#SIETYP 4'),   'SIE-fil innehåller #SIETYP 4');
  assert(sieData.includes('#FLAGGA 0'),   'SIE-fil innehåller #FLAGGA 0');
  assert(sieData.includes('#FORMAT PC8'), 'SIE-fil innehåller #FORMAT PC8');
  assert(sieData.includes('#KONTO 1930'), 'SIE-fil innehåller konto 1930');
  assert(sieData.includes('#KONTO 3000'), 'SIE-fil innehåller konto 3000');

  const verCount = (sieData.match(/#VER/g) ?? []).length;
  assert(verCount === 10, `SIE-fil innehåller 10 #VER-poster (fick ${verCount})`);

  const transCount = (sieData.match(/#TRANS/g) ?? []).length;
  assert(transCount === 25, `SIE-fil innehåller 25 #TRANS-rader (fick ${transCount})`);

  // Kontrollera ett par belopp
  assert(sieData.includes('50000.00'),  'Belopp 50000.00 finns i SIE-filen');
  assert(sieData.includes('-10000.00'), 'Belopp -10000.00 finns i SIE-filen');

  // ═══════════════════════════════════════════════════════════════════════
  // SIE-IMPORT (återskapa från exporterad fil)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── SIE4-import ───────────────────────────────────────\n');

  await db.transactions.clear();
  await db.vouchers.clear();
  await db.accounts.clear();

  await importSIE(sieData);

  const importedVouchers     = await db.vouchers.count();
  const importedTransactions = await db.transactions.count();
  const importedAccounts     = await db.accounts.count();

  assert(importedVouchers     === 10, `Import: 10 verifikationer (fick ${importedVouchers})`);
  assert(importedTransactions === 25, `Import: 25 transaktioner (fick ${importedTransactions})`);
  assert(importedAccounts     >  0,   `Import: konton importerades (fick ${importedAccounts})`);

  // Balanserna ska vara identiska efter import
  const afterImport = await getBalances();
  assert(near(afterImport.assets,    45850), `Import: tillgångar = 45 850 kr (fick ${afterImport.assets.toFixed(2)})`);
  assert(near(afterImport.revenue,   15000), `Import: intäkter = 15 000 kr (fick ${afterImport.revenue.toFixed(2)})`);
  assert(near(afterImport.expenses,  18650), `Import: kostnader = 18 650 kr (fick ${afterImport.expenses.toFixed(2)})`);
  assert(near(afterImport.netIncome, -3650), `Import: nettoresultat = -3 650 kr (fick ${afterImport.netIncome.toFixed(2)})`);

  // ═══════════════════════════════════════════════════════════════════════
  // SAMMANFATTNING
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n════════════════════════════════════════════════════════');
  console.log(` Resultat: ${passed} godkända  |  ${failed} misslyckade`);
  if (failed === 0) {
    console.log(' Alla tester GODKÄNDA ✓');
  } else {
    console.error(` ${failed} TEST(ER) MISSLYCKADES ✗`);
    process.exit(1);
  }
  console.log('════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
  console.error('Kritiskt fel:', err);
  process.exit(1);
});
