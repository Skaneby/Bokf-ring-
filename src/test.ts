import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { db, initializeDb } from './db';
import { exportSIE, importSIE } from './lib/sie';
import { buildBackupData, applyBackupData } from './lib/backup';
import { splitVat, vatRows, VAT_OUT, VAT_IN } from './lib/vat';

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
  const accounts     = await db.accounts.toArray();
  const transactions = await db.transactions.toArray();
  const map = new Map<number, number>();
  for (const t of transactions) map.set(t.accountId, (map.get(t.accountId) ?? 0) + t.amount);
  let assets = 0, liabilities = 0, revenue = 0, expenses = 0;
  for (const acc of accounts) {
    const bal = map.get(acc.id) ?? 0;
    if (acc.type === 'asset')                              assets      += bal;
    if (acc.type === 'liability' || acc.type === 'equity') liabilities -= bal;
    if (acc.type === 'revenue')                            revenue     -= bal;
    if (acc.type === 'expense')                            expenses    += bal;
  }
  return { assets, liabilities, revenue, expenses, netIncome: revenue - expenses };
}

async function resetDb() {
  await db.transactions.clear();
  await db.vouchers.clear();
  await db.accounts.clear();
  await initializeDb();
}

// ─── main ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log(' Lokal Bokföring – fullständigt testsvit');
  console.log('════════════════════════════════════════════════════════\n');

  // ═══════════════════════════════════════════════════════════════════════
  // 1. KONTOPLAN
  // ═══════════════════════════════════════════════════════════════════════

  console.log('── 1. Kontoplan ──────────────────────────────────────\n');

  await resetDb();
  const accountCount = await db.accounts.count();
  assert(accountCount === 21, `Exakt 21 standardkonton (fick ${accountCount})`);

  const accs = await db.accounts.toArray();
  assert(accs.some(a => a.id === 1930 && a.type === 'asset'),     'Konto 1930 är tillgång');
  assert(accs.some(a => a.id === 2610 && a.type === 'liability'), 'Konto 2610 är skuld');
  assert(accs.some(a => a.id === 2640 && a.type === 'asset'),     'Konto 2640 är tillgång (ing. moms)');
  assert(accs.some(a => a.id === 3000 && a.type === 'revenue'),   'Konto 3000 är intäkt');
  assert(accs.some(a => a.id === 4000 && a.type === 'expense'),   'Konto 4000 är kostnad');

  // ═══════════════════════════════════════════════════════════════════════
  // 2. MOMSSPLIT – splitVat()
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 2. Momssplit ──────────────────────────────────────\n');

  // 25 %
  { const r = splitVat(125, 25);
    assert(near(r.vat, 25),  '25%: moms på 125 kr = 25.00 kr');
    assert(near(r.net, 100), '25%: netto på 125 kr = 100.00 kr'); }

  // 12 %
  { const r = splitVat(112, 12);
    assert(near(r.vat, 12),  '12%: moms på 112 kr = 12.00 kr');
    assert(near(r.net, 100), '12%: netto på 112 kr = 100.00 kr'); }

  // 6 %
  { const r = splitVat(106, 6);
    assert(near(r.vat, 6),   '6%: moms på 106 kr = 6.00 kr');
    assert(near(r.net, 100), '6%: netto på 106 kr = 100.00 kr'); }

  // Klas Ohlson-kvitto (öresrundning)
  { const r = splitVat(668.60, 25);
    assert(near(r.vat, 133.72), 'Öresrundning 25%: 668.60 → moms 133.72 kr');
    assert(near(r.net, 534.88), 'Öresrundning 25%: 668.60 → netto 534.88 kr');
    assert(near(r.vat + r.net, 668.60), 'Öresrundning: vat + net = brutto (ingen penningförlust)'); }

  // 12 % med udda belopp
  { const r = splitVat(560, 12);
    assert(near(r.vat, 60),  '12%: moms på 560 kr = 60.00 kr');
    assert(near(r.net, 500), '12%: netto på 560 kr = 500.00 kr'); }

  // 6 % med udda belopp (öresrundning)
  { const r = splitVat(99.99, 6);
    assert(near(r.vat + r.net, 99.99), '6% öresrundning: vat + net = brutto'); }

  // Summa vat + net ska alltid = brutto (alla satser)
  for (const rate of [6, 12, 25] as const) {
    for (const gross of [100, 233.50, 1999.99, 12500]) {
      const { vat, net } = splitVat(gross, rate);
      assert(near(vat + net, gross), `splitVat(${gross}, ${rate}%): vat+net=brutto`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. MOMSKONTON – vatRows()
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 3. Momskonton ─────────────────────────────────────\n');

  // Korrekta momskonton per sats
  assert(VAT_OUT[25] === 2610, 'Utgående moms 25% → konto 2610');
  assert(VAT_OUT[12] === 2620, 'Utgående moms 12% → konto 2620');
  assert(VAT_OUT[6]  === 2630, 'Utgående moms 6%  → konto 2630');
  assert(VAT_IN      === 2640, 'Ingående moms alla satser → konto 2640');

  // Utgående (försäljning) 25%
  { const rows = vatRows(12500, 25, 'out');
    const bank = rows.find(r => r.accountId === 1930)!;
    const moms = rows.find(r => r.accountId === 2610)!;
    assert(near(bank.debit, 12500), 'Utgående 25%: bank debet 12500');
    assert(near(moms.credit, 2500), 'Utgående 25%: konto 2610 kredit 2500');
    assert(rows.length === 3,       'Utgående 25%: 3 rader genereras'); }

  // Ingående (inköp) 25%
  { const rows = vatRows(6250, 25, 'in');
    const bank = rows.find(r => r.accountId === 1930)!;
    const moms = rows.find(r => r.accountId === 2640)!;
    assert(near(bank.credit, 6250), 'Ingående 25%: bank kredit 6250');
    assert(near(moms.debit, 1250),  'Ingående 25%: konto 2640 debet 1250');
    assert(rows.length === 3,       'Ingående 25%: 3 rader genereras'); }

  // Ingående 12%
  { const rows = vatRows(560, 12, 'in');
    const moms = rows.find(r => r.accountId === 2640)!;
    assert(near(moms.debit, 60), 'Ingående 12%: konto 2640 debet 60 kr'); }

  // Ingående 6%
  { const rows = vatRows(106, 6, 'in');
    const moms = rows.find(r => r.accountId === 2640)!;
    assert(near(moms.debit, 6), 'Ingående 6%: konto 2640 debet 6 kr'); }

  // Varje rad: debet - kredit = 0 (balanserad)
  for (const dir of ['in', 'out'] as const) {
    for (const rate of [6, 12, 25] as const) {
      const rows = vatRows(1000, rate, dir);
      const diff = rows.reduce((s, r) => s + r.debit - r.credit, 0);
      assert(near(diff, 0), `vatRows(1000, ${rate}%, ${dir}): rader balanserar`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. TIO VERIFIKATIONER + BALANSRÄKNING
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 4. Verifikationer & balansräkning ─────────────────\n');

  await resetDb();

  await addVoucher('2026-01-01', 'Ägarinsättning startkapital', [
    { accountId: 1930, amount:  50000 }, { accountId: 2018, amount: -50000 },
  ]);
  await addVoucher('2026-01-05', 'Försäljning tjänst, 25% moms', [
    { accountId: 1930, amount:  12500 }, { accountId: 3000, amount: -10000 },
    { accountId: 2610, amount:  -2500 },
  ]);
  await addVoucher('2026-01-08', 'Inköp av varor', [
    { accountId: 4000, amount:  5000 }, { accountId: 2640, amount:  1250 },
    { accountId: 1930, amount: -6250 },
  ]);
  await addVoucher('2026-01-10', 'Lokalhyra januari', [
    { accountId: 5010, amount:  8000 }, { accountId: 1930, amount: -8000 },
  ]);
  await addVoucher('2026-01-12', 'Inköp programvara', [
    { accountId: 5420, amount:  3000 }, { accountId: 2640, amount:   750 },
    { accountId: 1930, amount: -3750 },
  ]);
  await addVoucher('2026-01-15', 'Kontorsmaterial', [
    { accountId: 6110, amount:   500 }, { accountId: 2640, amount:   125 },
    { accountId: 1930, amount:  -625 },
  ]);
  await addVoucher('2026-01-20', 'Bankavgifter januari', [
    { accountId: 6570, amount:   150 }, { accountId: 1930, amount:  -150 },
  ]);
  await addVoucher('2026-01-22', 'Redovisningstjänst', [
    { accountId: 6530, amount:  2000 }, { accountId: 2640, amount:   500 },
    { accountId: 1930, amount: -2500 },
  ]);
  await addVoucher('2026-01-25', 'Momsfri försäljning', [
    { accountId: 1930, amount:  5000 }, { accountId: 3040, amount: -5000 },
  ]);
  await addVoucher('2026-01-31', 'Eget uttag', [
    { accountId: 2013, amount:  3000 }, { accountId: 1930, amount: -3000 },
  ]);

  assert((await db.vouchers.count())     === 10, '10 verifikationer sparade');
  assert((await db.transactions.count()) === 25, '25 transaktionsrader sparade');

  const b = await getBalances();
  assert(near(b.assets,    45850),  `Tillgångar = 45 850 kr (fick ${b.assets.toFixed(2)})`);
  assert(near(b.liabilities, 49500),`Skulder & EK = 49 500 kr (fick ${b.liabilities.toFixed(2)})`);
  assert(near(b.revenue,   15000),  `Intäkter = 15 000 kr (fick ${b.revenue.toFixed(2)})`);
  assert(near(b.expenses,  18650),  `Kostnader = 18 650 kr (fick ${b.expenses.toFixed(2)})`);
  assert(near(b.netIncome, -3650),  `Nettoresultat = -3 650 kr (fick ${b.netIncome.toFixed(2)})`);
  assert(near(b.assets, b.liabilities + b.netIncome), 'Balansräkningsekvationen: T = S+EK+R');

  // ═══════════════════════════════════════════════════════════════════════
  // 5. REDIGERA VERIFIKATION
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 5. Redigera verifikation ──────────────────────────\n');

  // Hämta ver 2 (försäljning 12500) och ändra till 25000
  const allV = await db.vouchers.toArray();
  const ver2 = allV.find(v => v.description === 'Försäljning tjänst, 25% moms');
  assert(!!ver2?.id, 'Ver 2 hittas i databasen');

  const vid = ver2!.id!;
  await db.transaction('rw', db.vouchers, db.transactions, async () => {
    await db.vouchers.update(vid, { description: 'Försäljning tjänst, 25% moms (rättad)' });
    await db.transactions.where('voucherId').equals(vid).delete();
    await db.transactions.add({ voucherId: vid, accountId: 1930, amount:  25000 });
    await db.transactions.add({ voucherId: vid, accountId: 3000, amount: -20000 });
    await db.transactions.add({ voucherId: vid, accountId: 2610, amount:  -5000 });
  });

  const b2 = await getBalances();
  // Intäkter ökar med 10 000 (20000 - 10000)
  assert(near(b2.revenue, 25000),   `Efter redigering: intäkter = 25 000 kr (fick ${b2.revenue.toFixed(2)})`);
  // Nettoresultat förbättras med 10 000
  assert(near(b2.netIncome, 6350),  `Efter redigering: nettoresultat = 6 350 kr (fick ${b2.netIncome.toFixed(2)})`);
  assert(near(b2.assets, b2.liabilities + b2.netIncome), 'Balansräkning stämmer efter redigering');

  const updDesc = await db.vouchers.get(vid);
  assert(updDesc?.description === 'Försäljning tjänst, 25% moms (rättad)', 'Beskrivning uppdaterades');

  const newTx = await db.transactions.where('voucherId').equals(vid).toArray();
  assert(newTx.length === 3,              'Gamla rader ersattes — fortfarande 3 rader');
  assert(newTx.some(t => t.amount === 25000), 'Nytt belopp 25000 finns på ver 2');

  // ═══════════════════════════════════════════════════════════════════════
  // 6. TA BORT VERIFIKATION
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 6. Ta bort verifikation ───────────────────────────\n');

  const txBefore = await db.transactions.count();
  const vBefore  = await db.vouchers.count();

  // Ta bort bankavgiften (150 kr, 2 rader)
  const allV2   = await db.vouchers.toArray();
  const bankfee = allV2.find(v => v.description === 'Bankavgifter januari');
  assert(!!bankfee?.id, 'Bankavgiftsverifikation hittas');
  const bankfeeId = bankfee!.id!;

  await db.transaction('rw', db.vouchers, db.transactions, async () => {
    await db.transactions.where('voucherId').equals(bankfeeId).delete();
    await db.vouchers.delete(bankfeeId);
  });

  assert((await db.vouchers.count())     === vBefore  - 1, 'Antal verifikationer minskar med 1');
  assert((await db.transactions.count()) === txBefore - 2, 'Antal transaktionsrader minskar med 2');

  const b3 = await getBalances();
  // Bankavgift 150 kr borttagen → kostnader minskar 150, resultat förbättras 150
  assert(near(b3.expenses, b2.expenses - 150),    `Kostnader minskar 150 kr efter borttagning (fick ${b3.expenses.toFixed(2)})`);
  assert(near(b3.netIncome, b2.netIncome + 150),  `Nettoresultat ökar 150 kr efter borttagning (fick ${b3.netIncome.toFixed(2)})`);
  assert(near(b3.assets, b3.liabilities + b3.netIncome), 'Balansräkning stämmer efter borttagning');

  // ═══════════════════════════════════════════════════════════════════════
  // 7. VALIDERINGSREGLER
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 7. Valideringsregler ──────────────────────────────\n');

  const balanceOk = (lines: { amount: number }[]) =>
    near(lines.reduce((s, l) => s + l.amount, 0), 0);

  assert(!balanceOk([{ amount: 1000 }, { amount: -999 }]),   'Obalanserad verifikation avvisas');
  assert( balanceOk([{ amount:  500 }, { amount: -500 }]),   'Balanserad verifikation godkänns');
  assert( balanceOk([{ amount: 100.01 }, { amount: -100.01 }]), 'Öresbelopp balanserar korrekt');
  assert(!balanceOk([{ amount: 100 }, { amount: -99.99 }]),  'Differens 0.01 kr avvisas');

  const validRows = (rows: { accountId: number; debit: string; credit: string }[]) =>
    rows.filter(r => r.accountId && (r.debit || r.credit)).length;

  assert(validRows([{ accountId: 1930, debit: '100', credit: '' }]) < 2, 'En rad → underkänd');
  assert(validRows([
    { accountId: 1930, debit: '100', credit: '' },
    { accountId: 2018, debit: '',    credit: '100' },
  ]) >= 2, 'Två rader → godkänd');
  assert(validRows([{ accountId: 0, debit: '100', credit: '' }]) < 2, 'Rad utan konto ignoreras');

  // ═══════════════════════════════════════════════════════════════════════
  // 8. SIE4-EXPORT
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 8. SIE4-export ────────────────────────────────────\n');

  const sieData = await exportSIE();
  assert(sieData.includes('#SIETYP 4'),   'SIE: innehåller #SIETYP 4');
  assert(sieData.includes('#FLAGGA 0'),   'SIE: innehåller #FLAGGA 0');
  assert(sieData.includes('#FORMAT PC8'), 'SIE: innehåller #FORMAT PC8');
  assert(sieData.includes('#KONTO 1930'), 'SIE: innehåller konto 1930');
  assert(sieData.includes('#KONTO 3000'), 'SIE: innehåller konto 3000');
  assert(sieData.includes('#KONTO 2610'), 'SIE: innehåller momskonto 2610');
  assert(sieData.includes('#KONTO 2640'), 'SIE: innehåller momskonto 2640');

  const verCount   = (sieData.match(/#VER/g)   ?? []).length;
  const transCount = (sieData.match(/#TRANS/g) ?? []).length;
  const curVouchers = await db.vouchers.count();
  const curTx       = await db.transactions.count();
  assert(verCount   === curVouchers, `SIE: ${curVouchers} #VER-poster (fick ${verCount})`);
  assert(transCount === curTx,       `SIE: ${curTx} #TRANS-rader (fick ${transCount})`);

  assert(sieData.includes('50000.00'),  'SIE: belopp 50000.00 finns');
  assert(sieData.includes('-20000.00'), 'SIE: belopp -20000.00 finns (rättad försäljning)');

  // ═══════════════════════════════════════════════════════════════════════
  // 9. SIE4-IMPORT — round-trip
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 9. SIE4-import round-trip ─────────────────────────\n');

  const balBeforeImport = await getBalances();
  await db.transactions.clear();
  await db.vouchers.clear();
  await db.accounts.clear();
  await importSIE(sieData);

  const ai = await getBalances();
  assert(near(ai.assets,    balBeforeImport.assets),    `Import: tillgångar bevaras (${ai.assets.toFixed(2)})`);
  assert(near(ai.revenue,   balBeforeImport.revenue),   `Import: intäkter bevaras (${ai.revenue.toFixed(2)})`);
  assert(near(ai.expenses,  balBeforeImport.expenses),  `Import: kostnader bevaras (${ai.expenses.toFixed(2)})`);
  assert(near(ai.netIncome, balBeforeImport.netIncome), `Import: nettoresultat bevaras (${ai.netIncome.toFixed(2)})`);
  assert(near(ai.assets, ai.liabilities + ai.netIncome), 'Import: balansräkning stämmer');

  // ═══════════════════════════════════════════════════════════════════════
  // 10. SIE4-IMPORT — merge vs replace
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 10. SIE-import: merge vs replace ─────────────────\n');

  // Merge: befintlig data + importerad → fler verifikationer
  const vCountBefore = await db.vouchers.count();
  await importSIE(sieData, 'merge');
  const vCountAfterMerge = await db.vouchers.count();
  assert(vCountAfterMerge === vCountBefore * 2,
    `Merge: verifikationer fördubblades (${vCountBefore} → ${vCountAfterMerge})`);

  // Replace: ska bara innehålla det som importerades
  await importSIE(sieData, 'replace');
  const vCountAfterReplace = await db.vouchers.count();
  assert(vCountAfterReplace === vCountBefore,
    `Replace: bara importerade verifikationer kvar (${vCountAfterReplace})`);

  // ═══════════════════════════════════════════════════════════════════════
  // 11. BACKUP — JSON round-trip
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 11. Backup JSON round-trip ────────────────────────\n');

  const balBeforeBackup = await getBalances();
  const vBkp = await db.vouchers.count();
  const tBkp = await db.transactions.count();

  const backup = await buildBackupData();
  assert(backup.version === 1, 'Backup: version = 1');
  assert(Array.isArray(backup.accounts)     && backup.accounts.length > 0,     'Backup: konton inkluderade');
  assert(Array.isArray(backup.vouchers)     && backup.vouchers.length === vBkp, 'Backup: alla verifikationer inkluderade');
  assert(Array.isArray(backup.transactions) && backup.transactions.length === tBkp, 'Backup: alla transaktioner inkluderade');

  // Rensa och återställ
  await db.transactions.clear();
  await db.vouchers.clear();
  await db.accounts.clear();

  const result = await applyBackupData(backup);
  assert(result.vouchers     === vBkp, `Backup restore: ${vBkp} verifikationer återställda`);
  assert(result.transactions === tBkp, `Backup restore: ${tBkp} transaktioner återställda`);

  const balAfterBackup = await getBalances();
  assert(near(balAfterBackup.assets,    balBeforeBackup.assets),    'Backup: tillgångar bevaras');
  assert(near(balAfterBackup.revenue,   balBeforeBackup.revenue),   'Backup: intäkter bevaras');
  assert(near(balAfterBackup.expenses,  balBeforeBackup.expenses),  'Backup: kostnader bevaras');
  assert(near(balAfterBackup.netIncome, balBeforeBackup.netIncome), 'Backup: nettoresultat bevaras');

  // Ogiltig backup ska kasta fel
  let threw = false;
  try { await applyBackupData({ version: 1, exported_at: '', accounts: null as any, vouchers: [], transactions: [] }); }
  catch { threw = true; }
  assert(threw, 'Backup: ogiltig fil kastar fel');

  // ═══════════════════════════════════════════════════════════════════════
  // 12. IMPORT AV EXTERNA SIE-TESTFILER
  // ═══════════════════════════════════════════════════════════════════════

  async function importFile(filename: string) {
    const content = readFileSync(resolve('testdata', filename), 'utf-8');
    await db.transactions.clear();
    await db.vouchers.clear();
    await db.accounts.clear();
    await importSIE(content);
    return {
      vouchers:     await db.vouchers.count(),
      transactions: await db.transactions.count(),
      accounts:     await db.accounts.count(),
      balances:     await getBalances(),
    };
  }

  console.log('\n── 12. Import: fortnox_export.se ─────────────────────\n');
  {
    const r = await importFile('fortnox_export.se');
    assert(r.vouchers     === 6,  `Fortnox: 6 verifikationer (fick ${r.vouchers})`);
    assert(r.transactions === 16, `Fortnox: 16 transaktionsrader (fick ${r.transactions})`);
    assert(r.accounts      >  0,  `Fortnox: konton importerade (fick ${r.accounts})`);
    const { revenue, expenses, netIncome, assets, liabilities } = r.balances;
    assert(near(revenue,   15000), `Fortnox: intäkter = 15 000 kr`);
    assert(near(expenses,  55000), `Fortnox: kostnader = 55 000 kr`);
    assert(near(netIncome,-40000), `Fortnox: nettoresultat = -40 000 kr`);
    assert(near(assets, liabilities + netIncome), 'Fortnox: balansräkningsekvationen stämmer');
  }

  console.log('\n── 12. Import: visma_export.se ───────────────────────\n');
  {
    const r = await importFile('visma_export.se');
    assert(r.vouchers     === 9,  `Visma: 9 verifikationer (fick ${r.vouchers})`);
    assert(r.transactions === 24, `Visma: 24 transaktionsrader (fick ${r.transactions})`);
    const { revenue, expenses, netIncome, assets, liabilities } = r.balances;
    assert(near(revenue,  15000), `Visma: intäkter = 15 000 kr`);
    assert(near(expenses,  1295), `Visma: kostnader = 1 295 kr`);
    assert(near(netIncome,13705), `Visma: nettoresultat = 13 705 kr`);
    assert(near(assets, liabilities + netIncome), 'Visma: balansräkningsekvationen stämmer');
  }

  console.log('\n── 12. Import: edge_cases.se ─────────────────────────\n');
  {
    const r = await importFile('edge_cases.se');
    assert(r.vouchers     === 5,  `Kantfall: 5 verifikationer`);
    assert(r.transactions === 14, `Kantfall: 14 transaktionsrader`);
    const { assets, liabilities, netIncome } = r.balances;
    assert(near(assets, liabilities + netIncome), 'Kantfall: balansräkningsekvationen stämmer');
    const txs = await db.transactions.toArray();
    assert(txs.some(t => Math.abs(t.amount) === 12345.67 || Math.abs(t.amount) === 100.01),
      'Kantfall: decimalbelopp bevaras korrekt');
    assert(txs.some(t => t.accountId === 3000 && t.amount > 0),
      'Kantfall: kreditnota (positiv trans på intäktskonto) importeras');
  }

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
