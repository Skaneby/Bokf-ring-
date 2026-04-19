import 'fake-indexeddb/auto';
import { db, initializeDb } from './db';
import { exportSIE, importSIE } from './lib/sie';

async function runTests() {
  console.log('Starting tests...');

  
  // 1. Clear DB
  await db.transactions.clear();
  await db.vouchers.clear();
  await db.accounts.clear();
  
  // 2. Initialize accounts
  await initializeDb();
  console.log('DB Initialized with accounts:', await db.accounts.count());

  // 3. Create a voucher
  await db.transaction('rw', db.vouchers, db.transactions, async () => {
    const voucherId = await db.vouchers.add({
      date: '2026-01-01',
      description: 'Test insättning',
      created_at: Date.now()
    });

    await db.transactions.add({
      voucherId,
      accountId: 1930,
      amount: 10000 // Debit
    });

    await db.transactions.add({
      voucherId,
      accountId: 2018,
      amount: -10000 // Credit
    });
  });

  console.log('Voucher 1 created.');

  // 4. Create another voucher (Revenue)
  await db.transaction('rw', db.vouchers, db.transactions, async () => {
    const voucherId = await db.vouchers.add({
      date: '2026-01-02',
      description: 'Försäljning',
      created_at: Date.now()
    });

    await db.transactions.add({
      voucherId,
      accountId: 1930,
      amount: 1250 // Debit
    });

    await db.transactions.add({
      voucherId,
      accountId: 3000,
      amount: -1000 // Credit
    });

    await db.transactions.add({
      voucherId,
      accountId: 2610,
      amount: -250 // Credit
    });
  });

  console.log('Voucher 2 created.');

  // 5. Test calculations
  const transactions = await db.transactions.toArray();
  const accounts = await db.accounts.toArray();
  
  const accountBalances = new Map<number, number>();
  transactions.forEach(t => {
    const current = accountBalances.get(t.accountId) || 0;
    accountBalances.set(t.accountId, current + t.amount);
  });

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalRevenue = 0;
  let totalExpense = 0;

  accounts.forEach(acc => {
    const balance = accountBalances.get(acc.id) || 0;
    if (acc.type === 'asset') totalAssets += balance;
    if (acc.type === 'liability' || acc.type === 'equity') totalLiabilities -= balance; // Credit is negative, so -balance is positive
    if (acc.type === 'revenue') totalRevenue -= balance; 
    if (acc.type === 'expense') totalExpense += balance; 
  });

  const netIncome = totalRevenue - totalExpense;

  console.log('--- Balances ---');
  console.log('Assets (should be 11250):', totalAssets);
  console.log('Liabilities & Equity (should be 10250):', totalLiabilities);
  console.log('Revenue (should be 1000):', totalRevenue);
  console.log('Expense (should be 0):', totalExpense);
  console.log('Net Income (should be 1000):', netIncome);
  console.log('Balance Check (Assets === Liab + NetIncome):', totalAssets === (totalLiabilities + netIncome) ? 'PASS' : 'FAIL');

  // 6. Test SIE Export
  const sieData = await exportSIE();
  console.log('--- SIE Export ---');
  console.log(sieData.substring(0, 200) + '...');

  // 7. Test SIE Import
  await db.transactions.clear();
  await db.vouchers.clear();
  await db.accounts.clear();
  
  await importSIE(sieData);
  
  const importedVouchers = await db.vouchers.count();
  const importedTransactions = await db.transactions.count();
  
  console.log('--- SIE Import ---');
  console.log('Imported Vouchers (should be 2):', importedVouchers);
  console.log('Imported Transactions (should be 5):', importedTransactions);

  console.log('Tests complete.');
}

runTests().catch(console.error);
