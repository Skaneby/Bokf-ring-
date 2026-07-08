import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { db, initializeDb } from './db';
import { exportSIE, importSIE, decodeSIEBuffer } from './lib/sie';
import { buildBackupData, applyBackupData } from './lib/backup';
import { splitVat, vatRows, VAT_OUT, VAT_IN } from './lib/vat';
import { calculateEgenavgifter, calcNELines, calcMomsLines, EGENAVGIFTER_RATE } from './lib/tax';
import {
  parseGeminiJson, validateRows, lookupDict, buildVoucherLines,
  GeminiRow,
} from './lib/geminiImport';
import {
  invoiceTotals, invoiceCreationLines, invoicePaymentLines,
  createInvoice, registerPayment, cancelInvoice,
  getCompanySettings, saveCompanySettings, renderInvoiceHtml,
  DEFAULT_COMPANY,
} from './lib/invoice';
import { InvoiceRow } from './db';
import {
  serialize, normalizePackage, parseInfo, parseBlanketter,
  toIdNumber12, luhnValid, luhnCheckDigit, decodeLatin1,
  SruError, SruPackage, SruBlankett,
} from './lib/sru';
import {
  buildNeRows, taxYearsAvailable, getDeclaration, saveAdjustment,
  setDeclarationStatus, setSubmissionStep, renderNePrintHtml,
} from './lib/declaration';
import { buildNeSruPackage, NE_FORM_CODE } from './lib/neSru';
import { buildInk2Rows, buildInk2SruPackage, INK2R_FORM_CODE } from './lib/ink2';
import {
  getAiSettings, saveAiSettings, hasValidKey, gateMessage, NO_KEY_REPLY,
  buildSystemPrompt, isOnboardingDone, markOnboardingDone,
} from './lib/ai';

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
  await db.invoices.clear();
  await db.settings.clear();
  await db.declarations.clear();
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
  assert(accountCount === 25, `Exakt 25 standardkonton (fick ${accountCount})`);

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

  // KRITISK: balanskontrollen måste baseras på giltiga rader (samma som sparas)
  // Simulerar OCR-autofyll: kvitto 668.60 kr, 25% moms, ingående
  // Rad 1: tomt konto (kostnad ej vald), debet 534.88
  // Rad 2: 2640 ingående moms, debet 133.72
  // Rad 3: 1930 bank, kredit 668.60
  // Fel: balans på ALLA rader = 0 → godkänns trots att rad 1 saknar konto → 2 obalanserade rader sparas
  // Rätt: balans på GILTIGA rader → 133.72 - 668.60 = -534.88 → avvisas

  const simulateFormRows = (rows: { accountId: number | string; debit: string; credit: string }[]) => {
    const valid = rows.filter(r => r.accountId && (r.debit || r.credit));
    const debit  = valid.reduce((s, r) => s + (parseFloat(r.debit)  || 0), 0);
    const credit = valid.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
    return { valid: valid.length, diff: Math.round((debit - credit) * 100) / 100 };
  };

  const ocrRows = [
    { accountId: '',   debit: '534.88', credit: '' },   // kostnadskonto ej valt
    { accountId: 2640, debit: '133.72', credit: '' },
    { accountId: 1930, debit: '',       credit: '668.60' },
  ];
  const { valid: ocrValid, diff: ocrDiff } = simulateFormRows(ocrRows as any);
  assert(ocrValid === 2,           'OCR-autofyll utan kostnadskonto: 2 giltiga rader');
  assert(Math.abs(ocrDiff) > 0.01, 'OCR-autofyll utan kostnadskonto: obalans detekteras (diff=' + ocrDiff + ')');

  const completeRows = [
    { accountId: 5410, debit: '534.88', credit: '' },   // kostnadskonto valt
    { accountId: 2640, debit: '133.72', credit: '' },
    { accountId: 1930, debit: '',       credit: '668.60' },
  ];
  const { valid: fullValid, diff: fullDiff } = simulateFormRows(completeRows as any);
  assert(fullValid === 3,           'OCR-autofyll med kostnadskonto: 3 giltiga rader');
  assert(Math.abs(fullDiff) < 0.01, 'OCR-autofyll med kostnadskonto: balansen stämmer (diff=' + fullDiff + ')');

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
  // 13. SMOKE TEST — verifikationstyper korrelerar med rätt rapportpost
  // Testar att varje bokningstyp hamnar i rätt kategori i rapporterna,
  // inte bara att summan stämmer. Fångar fel som "inköp visas som tillgång".
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 13. Smoke test: rapport-korrelation ───────────────\n');

  await resetDb();

  // ── Scenario A: Ägarinsättning ─────────────────────────────────────
  // Ska öka tillgångar (bank) och eget kapital — INTE intäkter
  await addVoucher('2026-02-01', 'Ägarinsättning', [
    { accountId: 1930, amount:  100000 },
    { accountId: 2018, amount: -100000 },
  ]);
  {
    const b = await getBalances();
    assert(near(b.assets,      100000), 'Ägarinsättning: tillgångar ökar 100 000 kr');
    assert(near(b.liabilities, 100000), 'Ägarinsättning: eget kapital ökar 100 000 kr');
    assert(near(b.revenue,          0), 'Ägarinsättning: påverkar INTE intäkter');
    assert(near(b.expenses,         0), 'Ägarinsättning: påverkar INTE kostnader');
    assert(near(b.assets, b.liabilities + b.netIncome), 'Ägarinsättning: balansräkning stämmer');
  }

  // ── Scenario B: Inköp förbrukningsmaterial med 25% moms (Clas Ohlson-kvitto) ──
  // Ska öka kostnader (netto) + ingående moms (tillgång) och minska bank
  // FEL som tidigare hittades: kostnad hamnade som tillgång om kontot saknades
  await addVoucher('2026-02-03', 'Inköp förbrukningsmaterial', [
    { accountId: 5410, amount:   534.88 },   // kostnad netto
    { accountId: 2640, amount:   133.72 },   // ingående moms (tillgång)
    { accountId: 1930, amount:  -668.60 },   // bank kredit
  ]);
  {
    const b = await getBalances();
    // Bank: 100000 - 668.60 = 99331.40, Ing.moms: 133.72 → totalt 99465.12
    assert(near(b.assets, 99465.12),  `Inköp förbrukn: tillgångar = 99 465.12 kr (fick ${b.assets.toFixed(2)})`);
    assert(near(b.expenses, 534.88),  `Inköp förbrukn: kostnader = 534.88 kr — INTE tillgång (fick ${b.expenses.toFixed(2)})`);
    assert(near(b.revenue, 0),        'Inköp förbrukn: påverkar INTE intäkter');
    assert(near(b.assets, b.liabilities + b.netIncome), 'Inköp förbrukn: balansräkning stämmer');
  }

  // ── Scenario C: Försäljning med 25% moms ──────────────────────────
  // Ska öka intäkter (netto) och utgående moms (skuld), öka bank (tillgång)
  await addVoucher('2026-02-05', 'Försäljning med 25% moms', [
    { accountId: 1930, amount:  12500 },   // bank debet
    { accountId: 3000, amount: -10000 },   // intäkt kredit
    { accountId: 2610, amount:  -2500 },   // utgående moms kredit (skuld)
  ]);
  {
    const b = await getBalances();
    assert(near(b.revenue,  10000), `Försäljning: intäkter = 10 000 kr (fick ${b.revenue.toFixed(2)})`);
    assert(near(b.expenses, 534.88),`Försäljning: kostnader oförändrade (fick ${b.expenses.toFixed(2)})`);
    // Bank: 99331.40 + 12500 = 111831.40, Ing.moms: 133.72 → totalt 111965.12
    assert(near(b.assets, 111965.12), `Försäljning: tillgångar = 111 965.12 kr (fick ${b.assets.toFixed(2)})`);
    assert(near(b.assets, b.liabilities + b.netIncome), 'Försäljning: balansräkning stämmer');
  }

  // ── Scenario D: Kostnad utan moms (lokalhyra) ─────────────────────
  // Ska öka kostnader med hela beloppet, minska bank
  await addVoucher('2026-02-10', 'Lokalhyra februari', [
    { accountId: 5010, amount:  15000 },
    { accountId: 1930, amount: -15000 },
  ]);
  {
    const b = await getBalances();
    assert(near(b.expenses, 15534.88), `Momsfri kostnad: kostnader = 15 534.88 kr (fick ${b.expenses.toFixed(2)})`);
    assert(near(b.revenue,  10000),    'Momsfri kostnad: intäkter oförändrade');
    assert(near(b.assets, b.liabilities + b.netIncome), 'Momsfri kostnad: balansräkning stämmer');
  }

  // ── Scenario E: Försäljning med 12% moms ──────────────────────────
  // Ska använda konto 2620, inte 2610
  await addVoucher('2026-02-12', 'Försäljning 12% moms', [
    { accountId: 1930, amount:  5600 },
    { accountId: 3001, amount: -5000 },
    { accountId: 2620, amount:  -600 },
  ]);
  {
    const txs = await db.transactions.toArray();
    const has2620 = txs.some(t => t.accountId === 2620 && t.amount === -600);
    assert(has2620, '12% moms: bokförs på konto 2620 (inte 2610)');
    const b = await getBalances();
    assert(near(b.revenue, 15000), `12% moms: intäkter = 15 000 kr (fick ${b.revenue.toFixed(2)})`);
    assert(near(b.assets, b.liabilities + b.netIncome), '12% moms: balansräkning stämmer');
  }

  // ── Scenario F: Inköp med 12% moms ───────────────────────────────
  // Ingående moms ska alltid gå till 2640 oavsett sats
  await addVoucher('2026-02-14', 'Inköp 12% moms', [
    { accountId: 4000, amount:  5000 },
    { accountId: 2640, amount:   600 },
    { accountId: 1930, amount: -5600 },
  ]);
  {
    const txs = await db.transactions.toArray();
    const ingMoms = txs.filter(t => t.accountId === 2640);
    // Två ingående momsposter: 133.72 (25%) + 600 (12%)
    const totalIngMoms = ingMoms.reduce((s, t) => s + t.amount, 0);
    assert(near(totalIngMoms, 733.72), `Ingående moms 12%+25%: 2640 totalt = 733.72 kr (fick ${totalIngMoms.toFixed(2)})`);
    const b = await getBalances();
    assert(near(b.assets, b.liabilities + b.netIncome), 'Inköp 12%: balansräkning stämmer');
  }

  // ── Scenario G: Ägaruttag ─────────────────────────────────────────
  // Ska minska bank och eget kapital — INTE påverka resultat
  await addVoucher('2026-02-28', 'Ägaruttag', [
    { accountId: 2013, amount:  10000 },
    { accountId: 1930, amount: -10000 },
  ]);
  {
    const bBefore = await getBalances();
    // Hämta balans utan ägaruttaget och jämför
    const txs = await db.transactions.toArray();
    const uttag = txs.filter(t => t.accountId === 2013 || (t.accountId === 1930 && t.amount === -10000));
    assert(uttag.length === 2, 'Ägaruttag: 2 rader bokförda');
    // Resultatet ska vara detsamma som innan ägaruttaget (inte kostnader)
    // netIncome = intäkter - kostnader, påverkas inte av eget kapital-rörelser
    const netBefore = 15000 - 15534.88 - 5600; // rough check — income unchanged
    assert(near(bBefore.revenue,  15000),    'Ägaruttag: intäkter opåverkade');
    // 534.88 (förbrukn) + 15000 (hyra) + 5000 (varor 12%) = 20534.88
    assert(near(bBefore.expenses, 20534.88), `Ägaruttag: kostnader opåverkade (fick ${bBefore.expenses.toFixed(2)})`);
    assert(near(bBefore.assets, bBefore.liabilities + bBefore.netIncome), 'Ägaruttag: balansräkning stämmer');
  }

  // ── Slutkontroll: alla scenarion samlade ──────────────────────────
  {
    const b = await getBalances();
    assert(near(b.assets, b.liabilities + b.netIncome),
      `Slutkontroll: balansräkningsekvationen T(${b.assets.toFixed(2)}) = S+EK(${b.liabilities.toFixed(2)}) + R(${b.netIncome.toFixed(2)})`);
    assert(b.expenses > 0, 'Slutkontroll: kostnader är positiva');
    assert(b.revenue  > 0, 'Slutkontroll: intäkter är positiva');
    // Ingående moms är en tillgång — inte en kostnad
    const txs  = await db.transactions.toArray();
    const accs = await db.accounts.toArray();
    const momsAcc = accs.find(a => a.id === 2640)!;
    assert(momsAcc.type === 'asset', 'Ingående moms (2640) är kontoart tillgång — aldrig kostnad');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 14. SIE4-IMPORT FRÅN BL ADMINISTRATION (EXTERN FIL)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 14. SIE4-import BL Administration ────────────────');
  {
    await db.transaction('rw', db.accounts, db.vouchers, db.transactions, async () => {
      await db.transactions.clear(); await db.vouchers.clear(); await db.accounts.clear();
    });

    // Read with CP437 decoder — same path as browser
    const siePath = resolve(__dirname, '../src/test-fixtures/Unger_AnnaKarin_.SE');
    let sieContent: string;
    try {
      sieContent = decodeSIEBuffer(readFileSync(siePath));
    } catch {
      console.log('  ⚠  Fixture-fil saknas — hoppar över SIE4-import-test');
      console.log('     Kopiera Unger_AnnaKarin_.SE till src/test-fixtures/');
      sieContent = '';
    }

    if (sieContent) {
      await importSIE(sieContent, 'replace');

      const vouchers     = await db.vouchers.toArray();
      const transactions = await db.transactions.toArray();
      const accounts     = await db.accounts.toArray();

      assert(vouchers.length === 92,
        `92 verifikationer importerade (fick ${vouchers.length})`);
      assert(accounts.length > 100,
        `Fler än 100 konton importerade (fick ${accounts.length})`);

      // Kontotypmappning — BAS-kontoplan
      const a1930 = accounts.find(a => a.id === 1930);
      const a2610 = accounts.find(a => a.id === 2610);
      const a3011 = accounts.find(a => a.id === 3011);
      const a5410 = accounts.find(a => a.id === 5410);
      const a2010 = accounts.find(a => a.id === 2010);
      assert(a1930?.type === 'asset',     '1930 Företagskonto = tillgång');
      assert(a2610?.type === 'liability', '2610 Utgående moms = skuld');
      assert(a3011?.type === 'revenue',   '3011 Fakturerade tjänster = intäkt');
      assert(a5410?.type === 'expense',   '5410 Förbrukningsinv = kostnad');
      assert(a2010?.type === 'equity',    '2010 Eget kapital = eget kapital');

      // Korrekt datum och beskrivning
      const ver1 = vouchers.find(v => v.description === 'ELGIGANTEN');
      assert(ver1?.date === '2024-01-02', 'VER 1: datum 2024-01-02');

      // Korrekt transaktionsbelopp VER 1
      const ver1tx = transactions.filter(t => t.voucherId === ver1?.id);
      const bank1  = ver1tx.find(t => t.accountId === 1930);
      const exp1   = ver1tx.find(t => t.accountId === 5410);
      assert(near(bank1?.amount ?? 0, -1689), 'VER 1: 1930 = -1689.00');
      assert(near(exp1?.amount  ?? 0,  1689), 'VER 1: 5410 = +1689.00');

      // Försäljningsverifikation: faktura 1
      const fakt1 = vouchers.find(v => v.description === 'FAKT 1');
      const fakt1tx = transactions.filter(t => t.voucherId === fakt1?.id);
      const fakt1bank = fakt1tx.find(t => t.accountId === 1930);
      const fakt1rev  = fakt1tx.find(t => t.accountId === 3011);
      const fakt1moms = fakt1tx.find(t => t.accountId === 2610);
      assert(near(fakt1bank?.amount ?? 0,  7425),  'FAKT 1: bank +7425.00');
      assert(near(fakt1rev?.amount  ?? 0, -5940),  'FAKT 1: intäkt -5940.00');
      assert(near(fakt1moms?.amount ?? 0, -1485),  'FAKT 1: moms -1485.00');

      // Stor försäljning (VER 88: SCA 250 000 kr)
      const sca = vouchers.find(v => v.description === 'SCA');
      const scatx = transactions.filter(t => t.voucherId === sca?.id);
      const scaBank = scatx.find(t => t.accountId === 1930);
      assert(near(scaBank?.amount ?? 0, 250000), 'VER SCA: bank +250 000 kr');

      // Alla verifikationer är balanserade (debet = kredit)
      let imbalanced = 0;
      for (const v of vouchers) {
        const txs = transactions.filter(t => t.voucherId === v.id);
        const sum = txs.reduce((s, t) => s + t.amount, 0);
        if (Math.abs(sum) > 0.02) imbalanced++;
      }
      assert(imbalanced === 0,
        `Alla 92 verifikationer balanserade (${imbalanced} obalanserade)`);

      // Svenska tecken — ä/ö ska överleva ISO-8859-1 import
      const forbruk = accounts.find(a => a.id === 5460);
      assert(forbruk?.name.includes('Förbrukningsmaterial') ?? false,
        `Konto 5460 innehåller svenska tecken: "${forbruk?.name}"`);

      // Konto 8999 "Årets resultat" är bokslutskonto → eget kapital, ej kostnad
      const a8999 = accounts.find(a => a.id === 8999);
      assert(a8999?.type === 'equity',
        `8999 Årets resultat = eget kapital, ej kostnad (fick "${a8999?.type}")`);

      // P&L-beräkning — intäkter ≠ kostnader (tidigare bug: 8999 blåste upp kostnader)
      const bl = await getBalances();
      assert(near(bl.revenue,   231539.53),
        `Intäkter = 231 539,53 kr (fick ${bl.revenue.toFixed(2)})`);
      assert(near(bl.expenses,  111757.78),
        `Kostnader = 111 757,78 kr (fick ${bl.expenses.toFixed(2)})`);
      assert(near(bl.netIncome, 119781.75),
        `Årets resultat = 119 781,75 kr (fick ${bl.netIncome.toFixed(2)})`);
      assert(bl.revenue > bl.expenses,
        'Intäkter > Kostnader (ej lika p.g.a. 8999-klassificering)');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 15. SKATTELOGIK — egenavgifter, NE-bilaga, momsdeklaration
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 15. Skattelogik ───────────────────────────────────\n');

  // ── Egenavgifter: calculateEgenavgifter() ─────────────────────────────

  // Korrekt sats: 28.97% för åldersgrupp 'full'
  assert(near(EGENAVGIFTER_RATE.full,   0.2897), 'Egenavgifter: full-sats = 28.97 %');
  assert(near(EGENAVGIFTER_RATE.young,  0.1489), 'Egenavgifter: young-sats = 14.89 %');
  assert(near(EGENAVGIFTER_RATE.senior, 0.1488), 'Egenavgifter: senior-sats = 14.88 %');

  // Grundberäkning
  { const eg = calculateEgenavgifter(100000, 'full');
    assert(near(eg, 28970), `Egenavgifter 100 000 kr × 28.97% = 28 970 kr (fick ${eg})`); }

  // Negativt överskott → 0 kr
  { const eg = calculateEgenavgifter(-5000, 'full');
    assert(eg === 0, 'Egenavgifter vid underskott = 0 kr'); }

  // Noll → 0 kr
  { const eg = calculateEgenavgifter(0, 'full');
    assert(eg === 0, 'Egenavgifter vid nollresultat = 0 kr'); }

  // Young-bracket
  { const eg = calculateEgenavgifter(100000, 'young');
    assert(near(eg, 14890), `Egenavgifter young 100 000 kr = 14 890 kr (fick ${eg})`); }

  // Senior-bracket
  { const eg = calculateEgenavgifter(100000, 'senior');
    assert(near(eg, 14880), `Egenavgifter senior 100 000 kr = 14 880 kr (fick ${eg})`); }

  // Öresrundning
  { const eg = calculateEgenavgifter(75333, 'full');
    const expected = Math.round(75333 * 0.2897 * 100) / 100;
    assert(near(eg, expected), `Egenavgifter öresrundning 75 333 kr → ${expected} kr (fick ${eg})`); }

  // ── NE-bilagan: calcNELines() ─────────────────────────────────────────

  await resetDb();

  // Scenario: enkel bokföring med intäkter + kostnader
  await addVoucher('2026-01-05', 'Försäljning tjänst 25% moms', [
    { accountId: 1930, amount:  125000 },
    { accountId: 3000, amount: -100000 },
    { accountId: 2610, amount:  -25000 },
  ]);
  await addVoucher('2026-01-10', 'Lokalhyra', [
    { accountId: 5010, amount:  12000 },
    { accountId: 1930, amount: -12000 },
  ]);
  await addVoucher('2026-01-15', 'Inköp material', [
    { accountId: 4000, amount:  30000 },
    { accountId: 2640, amount:   7500 },
    { accountId: 1930, amount: -37500 },
  ]);
  await addVoucher('2026-01-31', 'Avsättning egenavgifter', [
    { accountId: 8422, amount:  16826 },   // 58000 × 28.97% ≈ 16802 (approximation)
    { accountId: 2514, amount: -16826 },
  ]);

  const ne14txs  = await db.transactions.toArray();
  const ne   = calcNELines(ne14txs);

  assert(near(ne.nettoomsattning, 100000), `NE R1 = 100 000 kr (fick ${ne.nettoomsattning})`);
  assert(near(ne.handelvaror,      30000), `NE R10 = 30 000 kr (fick ${ne.handelvaror})`);
  assert(near(ne.ovrigaExterna,    12000), `NE R11 = 12 000 kr (fick ${ne.ovrigaExterna})`);
  assert(near(ne.summaIntakter,   100000), `NE R9 summa intäkter = 100 000 kr (fick ${ne.summaIntakter})`);
  assert(near(ne.summaKostnader,   42000), `NE R17 summa kostnader = 42 000 kr (fick ${ne.summaKostnader})`);
  assert(near(ne.rorelseresultat,  58000), `NE R18 rörelseresultat = 58 000 kr (fick ${ne.rorelseresultat})`);
  // Egenavgifter bokförs på 8422 (8400-serien = finansiella kostnader)
  assert(near(ne.finansiellaKostnader, 16826), `NE R20 finansiella kostnader = 16 826 kr (fick ${ne.finansiellaKostnader})`);
  assert(near(ne.aretsResultat, 58000 - 16826), `NE årets resultat = ${58000 - 16826} kr (fick ${ne.aretsResultat})`);

  // ── Momsdeklaration: calcMomsLines() ─────────────────────────────────

  const moms = calcMomsLines(ne14txs);

  assert(near(moms.box05, 100000), `Moms ruta 05 = 100 000 kr (fick ${moms.box05})`);
  assert(near(moms.box10,  25000), `Moms ruta 10 = 25 000 kr utgående moms 25% (fick ${moms.box10})`);
  assert(near(moms.box11,      0), `Moms ruta 11 = 0 kr (ingen 12%-försäljning) (fick ${moms.box11})`);
  assert(near(moms.box12,      0), `Moms ruta 12 = 0 kr (ingen 6%-försäljning) (fick ${moms.box12})`);
  assert(near(moms.box48,   7500), `Moms ruta 48 = 7 500 kr ingående moms (fick ${moms.box48})`);
  assert(near(moms.box49,  17500), `Moms ruta 49 = 17 500 kr att betala (25000 − 7500) (fick ${moms.box49})`);

  // Ingen moms → alla rutor noll
  await resetDb();
  const emptyTxs = await db.transactions.toArray();
  const emptyMoms = calcMomsLines(emptyTxs);
  assert(emptyMoms.box49 === 0, 'Moms ruta 49 = 0 kr vid ingen bokföring');

  // ── Egna uttag påverkar inte NE-bilagan ──────────────────────────────

  await resetDb();
  await addVoucher('2026-02-01', 'Försäljning', [
    { accountId: 1930, amount:  50000 },
    { accountId: 3000, amount: -50000 },
  ]);
  const resBefore = calcNELines(await db.transactions.toArray()).aretsResultat;
  assert(near(resBefore, 50000), `NE resultat före uttag = 50 000 kr (fick ${resBefore})`);

  await addVoucher('2026-02-28', 'Eget uttag', [
    { accountId: 2013, amount:  20000 },
    { accountId: 1930, amount: -20000 },
  ]);
  const resAfter = calcNELines(await db.transactions.toArray()).aretsResultat;
  assert(near(resAfter, 50000), `NE resultat opåverkat av egna uttag (fick ${resAfter})`);
  assert(near(resBefore, resAfter), 'Egna uttag (konto 2013) påverkar INTE NE-bilagan');

  // ── Kontona 2514 och 8422 finns i standardkontoplanen ─────────────────

  await resetDb();
  const allAccs = await db.accounts.toArray();
  assert(allAccs.some(a => a.id === 2514 && a.type === 'liability'), 'Konto 2514 Beräknade egenavgifter är skuld');
  assert(allAccs.some(a => a.id === 8422 && a.type === 'expense'),   'Konto 8422 Egenavgifter är kostnad');
  assert(allAccs.some(a => a.id === 2013 && a.type === 'equity'),    'Konto 2013 Egna uttag är eget kapital');

  // ═══════════════════════════════════════════════════════════════════════
  // 16. GEMINI IMPORT — parser, validator, buildVoucherLines
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 16. Gemini import ─────────────────────────────────\n');

  // ── parseGeminiJson ───────────────────────────────────────────────────

  // Ren JSON-array
  { const rows = parseGeminiJson('[{"date":"2026-01-01","description":"Test","amount":100,"vat_rate":0}]');
    assert(Array.isArray(rows) && rows.length === 1, 'parseGeminiJson: parsar ren JSON-array'); }

  // Markdown-block med ```json
  { const md = '```json\n[{"date":"2026-01-01","description":"Test","amount":100,"vat_rate":0}]\n```';
    const rows = parseGeminiJson(md);
    assert(Array.isArray(rows) && rows.length === 1, 'parseGeminiJson: strippar ```json ... ``` block'); }

  // Markdown-block utan json-suffix
  { const md = '```\n[{"date":"2026-01-01","description":"Test","amount":100,"vat_rate":0}]\n```';
    const rows = parseGeminiJson(md);
    assert(Array.isArray(rows) && rows.length === 1, 'parseGeminiJson: strippar ``` ... ``` block utan json-suffix'); }

  // Icke-array → fel
  { let threw = false;
    try { parseGeminiJson('{"date":"2026-01-01"}'); } catch { threw = true; }
    assert(threw, 'parseGeminiJson: kastar fel om JSON inte är en array'); }

  // ── validateRows ──────────────────────────────────────────────────────

  const validRaw: GeminiRow = {
    date: '2026-05-15', description: 'Kontorsmaterial',
    amount: 250, vat_rate: 25, category: 'kontorsmaterial', suggested_account: 6110,
  };

  // Giltig rad → passerar
  { const rows = validateRows([validRaw]);
    assert(rows.length === 1 && rows[0].description === 'Kontorsmaterial',
      'validateRows: giltig rad passerar validering'); }

  // Saknat datum → fel
  { let threw = false;
    try { validateRows([{ ...validRaw, date: '' }]); } catch { threw = true; }
    assert(threw, 'validateRows: kastar fel vid tomt date'); }

  // Fel datumformat → fel
  { let threw = false;
    try { validateRows([{ ...validRaw, date: '15/05/2026' }]); } catch { threw = true; }
    assert(threw, 'validateRows: kastar fel vid datum i fel format'); }

  // Negativt belopp → fel
  { let threw = false;
    try { validateRows([{ ...validRaw, amount: -100 }]); } catch { threw = true; }
    assert(threw, 'validateRows: kastar fel vid negativt amount'); }

  // Nollbelopp → fel
  { let threw = false;
    try { validateRows([{ ...validRaw, amount: 0 }]); } catch { threw = true; }
    assert(threw, 'validateRows: kastar fel vid amount = 0'); }

  // Ogiltig momssats → fel
  { let threw = false;
    try { validateRows([{ ...validRaw, vat_rate: 10 as 0 }]); } catch { threw = true; }
    assert(threw, 'validateRows: kastar fel vid ogiltig vat_rate (10)'); }

  // Alla giltiga momssatser passerar
  for (const rate of [0, 6, 12, 25] as const) {
    const rows = validateRows([{ ...validRaw, vat_rate: rate }]);
    assert(rows.length === 1, `validateRows: vat_rate ${rate} är giltig`);
  }

  // Type-fält: revenue bevaras, default är expense
  { const rows = validateRows([{ ...validRaw, type: 'revenue' }]);
    assert(rows[0].type === 'revenue', 'validateRows: type=revenue bevaras'); }
  { const rows = validateRows([{ ...validRaw }]);
    assert(rows[0].type === 'expense', 'validateRows: type default = expense'); }

  // ── lookupDict ────────────────────────────────────────────────────────

  { const acc = lookupDict({ ...validRaw, category: 'kontorsmaterial', description: 'papper' });
    assert(acc === 6110, `lookupDict: 'kontorsmaterial' → konto 6110 (fick ${acc})`); }

  { const acc = lookupDict({ ...validRaw, category: 'programvara', description: 'SaaS' });
    assert(acc === 5420, `lookupDict: 'programvara' → konto 5420 (fick ${acc})`); }

  { const acc = lookupDict({ ...validRaw, category: 'lunch', description: 'restaurang' });
    assert(acc === 5990, `lookupDict: 'lunch' → konto 5990 (fick ${acc})`); }

  { const acc = lookupDict({ ...validRaw, category: undefined, description: 'okänd kostnad xyz' });
    assert(acc === null, 'lookupDict: okänd beskrivning → null'); }

  // ── buildVoucherLines ─────────────────────────────────────────────────

  // Hjälpfunktion: kontrollera att alla rader summerar till noll (dubbelbokföring)
  function isBalanced(lines: { accountId: number; amount: number }[]) {
    return Math.abs(lines.reduce((s, l) => s + l.amount, 0)) < 0.01;
  }

  // Kostnad utan moms: mainAccount debet + 1930 kredit
  { const row: GeminiRow = { date: '2026-01-01', description: 'Hyra', amount: 10000, vat_rate: 0 };
    const lines = buildVoucherLines(row, 5010);
    assert(isBalanced(lines), 'buildVoucherLines: kostnad 0% moms — balanserad');
    assert(lines.length === 2, 'buildVoucherLines: kostnad 0% moms — 2 rader');
    assert(lines.some(l => l.accountId === 5010 && l.amount > 0), 'buildVoucherLines: kostnad 0% moms — debet på kostnadskonto');
    assert(lines.some(l => l.accountId === 1930 && l.amount < 0), 'buildVoucherLines: kostnad 0% moms — kredit på bank'); }

  // Kostnad med 25% moms: mainAccount (netto) + 2640 (moms) + 1930 kredit (brutto)
  { const row: GeminiRow = { date: '2026-01-01', description: 'Material', amount: 12500, vat_rate: 25 };
    const lines = buildVoucherLines(row, 4000);
    assert(isBalanced(lines), 'buildVoucherLines: kostnad 25% moms — balanserad');
    assert(lines.length === 3, 'buildVoucherLines: kostnad 25% moms — 3 rader');
    assert(lines.some(l => l.accountId === 2640 && l.amount > 0), 'buildVoucherLines: kostnad 25% moms — debet 2640 ingående moms');
    assert(lines.some(l => l.accountId === 1930 && near(l.amount, -12500)), 'buildVoucherLines: kostnad 25% moms — kredit 1930 = -12 500 kr'); }

  // Intäkt utan moms: 1930 debet + mainAccount kredit
  { const row: GeminiRow = { date: '2026-01-01', description: 'Konsulttjänst', amount: 5000, vat_rate: 0 };
    const lines = buildVoucherLines(row, 3001);
    assert(isBalanced(lines), 'buildVoucherLines: intäkt 0% moms — balanserad');
    assert(lines.length === 2, 'buildVoucherLines: intäkt 0% moms — 2 rader');
    assert(lines.some(l => l.accountId === 1930 && l.amount > 0), 'buildVoucherLines: intäkt 0% moms — debet bank');
    assert(lines.some(l => l.accountId === 3001 && l.amount < 0), 'buildVoucherLines: intäkt 0% moms — kredit intäktskonto'); }

  // Intäkt med 25% moms: 1930 debet + mainAccount kredit (netto) + 2610 kredit (moms)
  { const row: GeminiRow = { date: '2026-01-01', description: 'Försäljning', amount: 12500, vat_rate: 25 };
    const lines = buildVoucherLines(row, 3000);
    assert(isBalanced(lines), 'buildVoucherLines: intäkt 25% moms — balanserad');
    assert(lines.length === 3, 'buildVoucherLines: intäkt 25% moms — 3 rader');
    assert(lines.some(l => l.accountId === 2610 && l.amount < 0), 'buildVoucherLines: intäkt 25% moms — kredit 2610 utgående moms');
    assert(lines.some(l => l.accountId === 1930 && near(l.amount, 12500)), 'buildVoucherLines: intäkt 25% moms — debet 1930 = 12 500 kr'); }

  // Intäkt med 12% moms: ska använda 2620 (inte 2610)
  { const row: GeminiRow = { date: '2026-01-01', description: 'Livsmedel', amount: 11200, vat_rate: 12 };
    const lines = buildVoucherLines(row, 3002);
    assert(isBalanced(lines), 'buildVoucherLines: intäkt 12% moms — balanserad');
    assert(lines.some(l => l.accountId === 2620 && l.amount < 0), 'buildVoucherLines: intäkt 12% moms — kredit 2620 (inte 2610)'); }

  // ═══════════════════════════════════════════════════════════════════════
  // 17. FAKTURERING
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 17. Fakturering ───────────────────────────────────\n');

  await resetDb();

  const sumLines = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);

  // ── invoiceTotals: belopp och momsgrupper ─────────────────────────────
  { const rows: InvoiceRow[] = [
      { description: 'Konsult', qty: 10, unitPrice: 950,  vatRate: 25 },
      { description: 'Resa',    qty: 1,  unitPrice: 450,  vatRate: 6  },
      { description: 'Bok',     qty: 2,  unitPrice: 100,  vatRate: 6  },
    ];
    const t = invoiceTotals(rows);
    assert(near(t.netTotal, 10150),   `invoiceTotals: netto 10 150 kr (fick ${t.netTotal})`);
    assert(near(t.vatTotal, 2375 + 39), `invoiceTotals: moms 2 414 kr (fick ${t.vatTotal})`);
    assert(near(t.grossTotal, 12564), `invoiceTotals: brutto 12 564 kr (fick ${t.grossTotal})`);
    assert(t.groups.length === 2, 'invoiceTotals: två momsgrupper (25% och 6%)');
    const g6 = t.groups.find(g => g.rate === 6)!;
    assert(near(g6.net, 650) && near(g6.vat, 39), 'invoiceTotals: 6%-gruppen = 650 netto / 39 moms'); }

  // ── invoiceCreationLines: fakturametoden vid skapande ─────────────────
  { const rows: InvoiceRow[] = [{ description: 'Arbete', qty: 1, unitPrice: 10000, vatRate: 25 }];
    const lines = invoiceCreationLines(rows);
    assert(near(sumLines(lines), 0), 'invoiceCreationLines: raderna balanserar');
    assert(lines.some(l => l.accountId === 1510 && near(l.amount, 12500)), 'invoiceCreationLines: 1510 debet 12 500 (brutto)');
    assert(lines.some(l => l.accountId === 3000 && near(l.amount, -10000)), 'invoiceCreationLines: 3000 kredit 10 000 (netto)');
    assert(lines.some(l => l.accountId === 2610 && near(l.amount, -2500)), 'invoiceCreationLines: 2610 kredit 2 500 (moms)'); }

  // Momsfri rad → inget momskonto
  { const lines = invoiceCreationLines([{ description: 'Momsfritt', qty: 1, unitPrice: 5000, vatRate: 0 }]);
    assert(near(sumLines(lines), 0), 'invoiceCreationLines momsfri: balanserar');
    assert(lines.some(l => l.accountId === 3040 && near(l.amount, -5000)), 'invoiceCreationLines momsfri: 3040 kredit');
    assert(!lines.some(l => [2610, 2620, 2630].includes(l.accountId)), 'invoiceCreationLines momsfri: inga momskonton'); }

  // ── invoicePaymentLines ────────────────────────────────────────────────
  { const rows: InvoiceRow[] = [{ description: 'Arbete', qty: 1, unitPrice: 10000, vatRate: 25 }];
    const faktura = invoicePaymentLines(rows, 'faktura');
    assert(near(sumLines(faktura), 0), 'invoicePaymentLines faktura: balanserar');
    assert(faktura.some(l => l.accountId === 1930 && near(l.amount, 12500)), 'invoicePaymentLines faktura: 1930 debet brutto');
    assert(faktura.some(l => l.accountId === 1510 && near(l.amount, -12500)), 'invoicePaymentLines faktura: 1510 kredit brutto');
    assert(faktura.length === 2, 'invoicePaymentLines faktura: exakt 2 rader');

    const kontant = invoicePaymentLines(rows, 'kontant');
    assert(near(sumLines(kontant), 0), 'invoicePaymentLines kontant: balanserar');
    assert(kontant.some(l => l.accountId === 1930 && near(l.amount, 12500)), 'invoicePaymentLines kontant: 1930 debet brutto');
    assert(kontant.some(l => l.accountId === 3000 && near(l.amount, -10000)), 'invoicePaymentLines kontant: 3000 kredit netto');
    assert(kontant.some(l => l.accountId === 2610 && near(l.amount, -2500)), 'invoicePaymentLines kontant: 2610 kredit moms');
    assert(!kontant.some(l => l.accountId === 1510), 'invoicePaymentLines kontant: 1510 används inte'); }

  // ── createInvoice: löpande nummerserie ────────────────────────────────
  const mkInvoice = (method: 'faktura' | 'kontant', price = 1000) => createInvoice({
    date: '2026-07-01', dueDate: '2026-07-31',
    customerName: 'Testkund AB',
    rows: [{ description: 'Tjänst', qty: 1, unitPrice: price, vatRate: 25 }],
    method,
  });

  const inv1 = await mkInvoice('faktura');
  const inv2 = await mkInvoice('faktura');
  const inv3 = await mkInvoice('kontant');
  assert(inv1.number === 1 && inv2.number === 2 && inv3.number === 3,
    `createInvoice: löpande nummer 1, 2, 3 (fick ${inv1.number}, ${inv2.number}, ${inv3.number})`);

  assert(inv1.createdVoucherId !== undefined, 'createInvoice fakturametoden: verifikat bokfört vid skapande');
  assert(inv3.createdVoucherId === undefined, 'createInvoice kontantmetoden: INGET verifikat vid skapande');

  { const b = await getBalances();
    // Två fakturor à 1250 brutto bokförda mot 1510
    assert(near(b.assets, 2500), `Fakturametoden: tillgångar (1510) = 2 500 kr (fick ${b.assets})`);
    assert(near(b.revenue, 2000), `Fakturametoden: intäkter = 2 000 kr (fick ${b.revenue})`);
    assert(near(b.assets, b.liabilities + b.netIncome), 'Balansekvationen håller efter fakturaskapande'); }

  // ── registerPayment ────────────────────────────────────────────────────
  await registerPayment(inv1.id!, '2026-07-15');
  { const paid = await db.invoices.get(inv1.id!);
    assert(paid?.status === 'betald' && paid.paidDate === '2026-07-15', 'registerPayment: status betald + datum');
    assert(paid?.paidVoucherId !== undefined, 'registerPayment: betalningsverifikat bokfört'); }

  await registerPayment(inv3.id!, '2026-07-20');
  { const b = await getBalances();
    // inv1 betald (1250 flyttat 1510→1930), inv2 kvar på 1510 (1250), inv3 kontant betald (+1250 till 1930, +1000 intäkt)
    assert(near(b.assets, 3750), `Efter betalningar: tillgångar = 3 750 kr (fick ${b.assets})`);
    assert(near(b.revenue, 3000), `Efter betalningar: intäkter = 3 000 kr (fick ${b.revenue})`);
    assert(near(b.assets, b.liabilities + b.netIncome), 'Balansekvationen håller efter betalningar'); }

  // Dubbelbetalning ska avvisas
  { let threw = false;
    try { await registerPayment(inv1.id!, '2026-07-16'); } catch { threw = true; }
    assert(threw, 'registerPayment: redan betald faktura avvisas'); }

  // ── cancelInvoice: makulering vänder bokningen, numret återanvänds inte ──
  const inv4 = await mkInvoice('faktura');
  assert(inv4.number === 4, 'createInvoice: nummer 4 efter tre tidigare');
  const balBefore = await getBalances();
  await cancelInvoice(inv4.id!, '2026-07-21');
  { const cancelled = await db.invoices.get(inv4.id!);
    assert(cancelled?.status === 'makulerad', 'cancelInvoice: status makulerad');
    const b = await getBalances();
    assert(near(b.assets, balBefore.assets - 1250), 'cancelInvoice: 1510 återställt (reversering bokförd)');
    assert(near(b.revenue, balBefore.revenue - 1000), 'cancelInvoice: intäkten återförd');
    assert(near(b.assets, b.liabilities + b.netIncome), 'Balansekvationen håller efter makulering'); }

  const inv5 = await mkInvoice('kontant');
  assert(inv5.number === 5, 'Nummerserien fortsätter efter makulering — nummer återanvänds aldrig');

  // Betald faktura kan inte makuleras
  { let threw = false;
    try { await cancelInvoice(inv1.id!, '2026-07-22'); } catch { threw = true; }
    assert(threw, 'cancelInvoice: betald faktura kan inte makuleras'); }

  // ── Inställningar ──────────────────────────────────────────────────────
  { await saveCompanySettings({ ...DEFAULT_COMPANY, name: 'Mitt Företag AB', nextInvoiceNumber: 100 });
    const s = await getCompanySettings();
    assert(s.name === 'Mitt Företag AB' && s.nextInvoiceNumber === 100, 'Företagsinställningar sparas och läses');
    const inv100 = await mkInvoice('kontant');
    assert(inv100.number === 100, 'Startnummer från inställningar respekteras'); }

  // ── renderInvoiceHtml ──────────────────────────────────────────────────
  { const s = await getCompanySettings();
    const html = renderInvoiceHtml(inv1, { ...s, name: 'Mitt Företag AB', bankgiro: '123-4567' });
    assert(html.includes('Faktura'), 'renderInvoiceHtml: innehåller rubrik');
    assert(html.includes('Testkund AB'), 'renderInvoiceHtml: kundnamn med');
    assert(html.includes('Mitt Företag AB'), 'renderInvoiceHtml: företagsnamn med');
    assert(html.includes('123-4567'), 'renderInvoiceHtml: bankgiro med');
    assert(!html.includes('{{'), 'renderInvoiceHtml: alla tokens ersatta');
    // HTML-injektion i kundnamn ska escapas
    const evil = { ...inv1, customerName: '<script>alert(1)</script>' };
    const html2 = renderInvoiceHtml(evil, s);
    assert(!html2.includes('<script>alert'), 'renderInvoiceHtml: kundnamn HTML-escapas'); }

  // ═══════════════════════════════════════════════════════════════════════
  // 18. SRU-EXPORT (M0 — deklarationsmodulen)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 18. SRU-export ────────────────────────────────────\n');

  const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  // ── Luhn & id-nummer ───────────────────────────────────────────────────
  assert(luhnValid('5560000167'), 'Luhn: giltigt orgnr 5560000167');
  assert(!luhnValid('5560000168'), 'Luhn: fel kontrollsiffra avvisas');
  assert(luhnCheckDigit('556000016') === 7, 'Luhn: kontrollsiffra beräknas korrekt');
  assert(toIdNumber12('556000-0167') === '165560000167', 'toIdNumber12: 10 siffror + bindestreck → sekelprefix 16');
  assert(toIdNumber12('165560000167') === '165560000167', 'toIdNumber12: 12 siffror passerar oförändrat');
  { let code = ''; try { toIdNumber12('5560000168'); } catch (e) { code = (e as SruError).code; }
    assert(code === 'SRU-ORGNR-01', 'toIdNumber12: fel kontrollsiffra → SRU-ORGNR-01'); }
  { let code = ''; try { toIdNumber12('4806262517'); } catch (e) { code = (e as SruError).code; }
    assert(code === 'SRU-ORGNR-02', 'toIdNumber12: personnummer utan sekel avvisas'); }

  // ── Kanoniskt paket (samma som golden files) ───────────────────────────
  const goldenPkg: SruPackage = {
    createdAt: { date: '20260708', time: '143211' },
    program: { name: 'Lokal Bokföring', version: '2.0' },
    sender: {
      orgNumber: '556000-0167',
      name: 'Exempelbolaget ÅÄÖ AB',
      address: 'Storgatan 1', postalCode: '11122', city: 'STOCKHOLM',
      contact: 'Karl Karlsson', email: 'kk@exempelbolaget.se', phone: '08-2121212',
    },
    blanketter: [
      { formCode: 'INK2S-2026P1', idNumber: '165560000167',
        uppgifter: [{ fieldCode: '8686', value: '125000' }] },
      { formCode: 'INK2R-2026P1', idNumber: '5560000167', name: 'Exempelbolaget ÅÄÖ AB',
        uppgifter: [
          { fieldCode: '7511', value: '48000' },
          { fieldCode: '7410', value: '1250000' },
          { fieldCode: '7512', value: '-35000' },
          { fieldCode: '8580', value: 'Övriga upplysningar änges här' },
        ] },
    ],
  };

  // ── Golden files: byte-identisk regression ─────────────────────────────
  { const { info, blanketter } = serialize(goldenPkg);
    const goldenInfo = new Uint8Array(readFileSync(resolve(__dirname, 'test-fixtures/sru-golden/INFO.SRU')));
    const goldenBlank = new Uint8Array(readFileSync(resolve(__dirname, 'test-fixtures/sru-golden/BLANKETTER.SRU')));
    assert(bytesEqual(info, goldenInfo), `Golden: INFO.SRU byte-identisk (${info.length} bytes)`);
    assert(bytesEqual(blanketter, goldenBlank), `Golden: BLANKETTER.SRU byte-identisk (${blanketter.length} bytes)`);
    const text = decodeLatin1(blanketter);
    assert(text.indexOf('#BLANKETT INK2R') < text.indexOf('#BLANKETT INK2S'),
      'Golden: blanketter deterministiskt sorterade på blankettkod');
    assert((text.match(/#FIL_SLUT/g) ?? []).length === 1, 'Golden: exakt en #FIL_SLUT i BLANKETTER.SRU');
    assert(text.endsWith('#FIL_SLUT\r\n'), 'Golden: filen slutar med #FIL_SLUT + CRLF');
    // åäö kodas som Latin-1, inte UTF-8: Ö = 0xD6 (en byte, inte två)
    assert(blanketter.includes(0xd6), 'Golden: Ö kodas som Latin-1-byte 0xD6'); }

  // ── Round-trip: parse(serialize(x)) == normalize(x) ────────────────────
  { const { info, blanketter } = serialize(goldenPkg);
    const norm = normalizePackage(goldenPkg);
    const pInfo = parseInfo(info);
    assert(JSON.stringify(pInfo.sender) === JSON.stringify(norm.sender), 'Round-trip: sender identisk');
    assert(pInfo.skapad.date === '20260708' && pInfo.skapad.time === '143211', 'Round-trip: #SKAPAD bevarad');
    assert(pInfo.program.name === 'Lokal Bokföring' && pInfo.program.version === '2.0', 'Round-trip: #PROGRAM bevarad');
    assert(pInfo.filnamn === 'BLANKETTER.SRU', 'Round-trip: #FILNAMN pekar på blankettfilen');
    const pBlank = parseBlanketter(blanketter);
    assert(JSON.stringify(pBlank) === JSON.stringify(norm.blanketter), 'Round-trip: blanketter identiska'); }

  // ── Determinism ────────────────────────────────────────────────────────
  { const a = serialize(goldenPkg); const b = serialize(goldenPkg);
    assert(bytesEqual(a.info, b.info) && bytesEqual(a.blanketter, b.blanketter),
      'Determinism: samma paket → byte-identiska filer'); }

  // ── Valideringsfel ─────────────────────────────────────────────────────
  const expectSruError = (mutate: (p: SruPackage) => void, expectedCode: string, label: string) => {
    const p: SruPackage = JSON.parse(JSON.stringify(goldenPkg));
    mutate(p);
    let code = '';
    try { serialize(p); } catch (e) { code = e instanceof SruError ? e.code : 'ANNAT'; }
    assert(code === expectedCode, `${label} → ${expectedCode}`, `fick "${code}"`);
  };

  expectSruError(p => { p.blanketter = []; }, 'SRU-EMPTY-01', 'Tomt paket');
  expectSruError(p => { p.blanketter[0].formCode = 'HEJ'; }, 'SRU-FORM-01', 'Ogiltig blankettkod');
  expectSruError(p => { p.blanketter[0].uppgifter = []; }, 'SRU-FORM-02', 'Blankett utan uppgifter');
  expectSruError(p => { p.blanketter[0].uppgifter[0].fieldCode = '86'; }, 'SRU-FIELD-01', 'Fältkod med fel längd');
  expectSruError(p => { p.blanketter[1].uppgifter[1].fieldCode = '7511'; }, 'SRU-FIELD-02', 'Duplicerad fältkod');
  expectSruError(p => { p.blanketter[0].uppgifter[0].value = ''; }, 'SRU-VAL-01', 'Tomt värde');
  expectSruError(p => { p.blanketter[0].uppgifter[0].value = 'rad1\nrad2'; }, 'SRU-VAL-02', 'Radbrytning i värde');
  expectSruError(p => { p.blanketter[0].uppgifter[0].value = ' 125000'; }, 'SRU-VAL-03', 'Inledande blanksteg');
  expectSruError(p => { p.sender.name = 'Smiley 😀 AB'; }, 'SRU-ENC-01', 'Tecken utanför Latin-1');
  expectSruError(p => { p.createdAt.date = '2026-07-08'; }, 'SRU-TS-01', 'Fel datumformat');
  expectSruError(p => { p.blanketter[0].idNumber = '5560000168'; }, 'SRU-ORGNR-01', 'Ogiltigt id-nummer på blankett');

  // ── 5 MB-gränsen ───────────────────────────────────────────────────────
  { const big: SruPackage = {
      ...goldenPkg,
      blanketter: ['INK2R-2026P1', 'INK2S-2026P1', 'NE-2026P1'].map(formCode => ({
        formCode, idNumber: '165560000167',
        uppgifter: Array.from({ length: 9000 }, (_, i) => ({
          fieldCode: String(1000 + i), value: 'X'.repeat(230),
        })),
      })),
    };
    let code = '';
    try { serialize(big); } catch (e) { code = e instanceof SruError ? e.code : 'ANNAT'; }
    assert(code === 'SRU-SIZE-01', 'BLANKETTER.SRU över 5 MB → SRU-SIZE-01'); }

  // ── Property-tester: slumpade giltiga paket (seedad PRNG) ──────────────
  { const mulberry32 = (seed: number) => () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rnd = mulberry32(42);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
    const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

    const NAME_CHARS = 'ABCDEFÅÄÖabcdefåäöghijkl0123456789';
    const randName = () => {
      let s = pick([...NAME_CHARS]);
      const n = int(0, 20);
      for (let i = 0; i < n; i++) s += pick([...(NAME_CHARS + '  .-')]);
      return s + pick([...NAME_CHARS]); // aldrig blanksteg först/sist
    };
    const randOrgnr = () => {
      let body9 = String(int(2, 9)); // tredje siffran ≥ 2 fixas nedan
      body9 = String(int(1, 9)) + String(int(0, 9)) + String(int(2, 9));
      for (let i = 0; i < 6; i++) body9 += String(int(0, 9));
      const full = body9 + String(luhnCheckDigit(body9));
      return rnd() < 0.5 ? full : '16' + full; // testa både 10- och 12-siffrig indata
    };
    const randValue = () => pick([
      () => String(int(-999999, 9999999)),
      () => `${int(2020, 2026)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
      () => randName(),
    ])();
    const FORMS = ['INK2R-2026P1', 'INK2S-2026P1', 'NE-2026P1', 'K10-2026P1', 'N8-2026P1'];

    const randPackage = (): SruPackage => {
      const nBlank = int(1, 4);
      const usedForms = new Set<string>();
      const blanketter: SruBlankett[] = [];
      for (let i = 0; i < nBlank; i++) {
        let formCode = pick(FORMS);
        while (usedForms.has(formCode)) formCode = pick(FORMS);
        usedForms.add(formCode);
        const nUpp = int(1, 12);
        const codes = new Set<string>();
        while (codes.size < nUpp) codes.add(String(int(1000, 9999)));
        blanketter.push({
          formCode,
          idNumber: randOrgnr(),
          ...(rnd() < 0.5 ? { name: randName() } : {}),
          uppgifter: [...codes].map(fieldCode => ({ fieldCode, value: randValue() })),
        });
      }
      return {
        createdAt: { date: `2026${String(int(1, 12)).padStart(2, '0')}${String(int(1, 28)).padStart(2, '0')}`,
                     time: `${String(int(0, 23)).padStart(2, '0')}${String(int(0, 59)).padStart(2, '0')}${String(int(0, 59)).padStart(2, '0')}` },
        program: { name: randName(), version: `${int(1, 9)}.${int(0, 9)}` },
        sender: { orgNumber: randOrgnr(), name: randName(),
                  ...(rnd() < 0.5 ? { email: 'test@example.se' } : {}) },
        blanketter,
      };
    };

    const failures: string[] = [];
    const N = 150;
    for (let iter = 0; iter < N; iter++) {
      const pkg = randPackage();
      try {
        const a = serialize(pkg);
        const b = serialize(pkg);
        if (!bytesEqual(a.info, b.info) || !bytesEqual(a.blanketter, b.blanketter))
          failures.push(`iter ${iter}: ej deterministisk`);
        const norm = normalizePackage(pkg);
        const parsed = parseBlanketter(a.blanketter);
        if (JSON.stringify(parsed) !== JSON.stringify(norm.blanketter))
          failures.push(`iter ${iter}: round-trip skiljer`);
        const pInfo = parseInfo(a.info);
        if (JSON.stringify(pInfo.sender) !== JSON.stringify(norm.sender))
          failures.push(`iter ${iter}: sender round-trip skiljer`);
        const text = decodeLatin1(a.blanketter);
        if ((text.match(/#FIL_SLUT/g) ?? []).length !== 1)
          failures.push(`iter ${iter}: fel antal #FIL_SLUT`);
        for (const byte of a.blanketter) {
          if (byte !== 0x0d && byte !== 0x0a && !((byte >= 0x20 && byte <= 0x7e) || byte >= 0xa0)) {
            failures.push(`iter ${iter}: otillåten byte 0x${byte.toString(16)}`);
            break;
          }
        }
      } catch (e) {
        failures.push(`iter ${iter}: oväntat fel ${e instanceof Error ? e.message : e}`);
      }
    }
    assert(failures.length === 0,
      `Property-test: ${N} slumpade paket — determinism, round-trip, #FIL_SLUT, encoding`,
      failures.slice(0, 3).join('; '));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 19. DEKLARATION — BLANKETTVY NE (M1)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 19. Deklaration NE ────────────────────────────────\n');

  await resetDb();

  // Bokföring 2025: försäljning 100 000 (moms 25 000), momsfri intäkt 5 000,
  // varuinköp 30 000, externa kostnader 12 000, egenavgiftsavsättning 10 000
  await addVoucher('2025-03-01', 'Försäljning', [
    { accountId: 1930, amount: 125000 },
    { accountId: 3000, amount: -100000 },
    { accountId: 2610, amount: -25000 },
  ]);
  await addVoucher('2025-04-01', 'Momsfri försäljning', [
    { accountId: 1930, amount: 5000 },
    { accountId: 3040, amount: -5000 },
  ]);
  await addVoucher('2025-05-01', 'Varuinköp', [
    { accountId: 4000, amount: 30000 },
    { accountId: 1930, amount: -30000 },
  ]);
  await addVoucher('2025-06-01', 'Bankavgifter', [
    { accountId: 6570, amount: 12000 },
    { accountId: 1930, amount: -12000 },
  ]);
  await addVoucher('2025-12-31', 'Avsättning egenavgifter', [
    { accountId: 8422, amount: 10000 },
    { accountId: 2514, amount: -10000 },
  ]);
  // Annan årgång — ska INTE ingå i 2025
  await addVoucher('2026-01-15', 'Försäljning nästa år', [
    { accountId: 1930, amount: 50000 },
    { accountId: 3000, amount: -50000 },
  ]);

  const neVouchers = await db.vouchers.toArray();
  const neTxs      = await db.transactions.toArray();

  // ── taxYearsAvailable ──────────────────────────────────────────────────
  { const years = taxYearsAvailable(neVouchers);
    assert(years[0] === 2026 && years[1] === 2025 && years.length === 2,
      `taxYearsAvailable: [2026, 2025] (fick ${JSON.stringify(years)})`); }

  // ── Automappning per rad ───────────────────────────────────────────────
  { const rows = buildNeRows(neVouchers, neTxs, 2025);
    const get = (id: string) => rows.find(r => r.id === id)!;
    assert(near(get('R1').value, 100000),  `NE R1 momspliktiga intäkter = 100 000 (fick ${get('R1').value})`);
    assert(near(get('R2').value, 5000),    `NE R2 momsfria intäkter = 5 000 (fick ${get('R2').value})`);
    assert(near(get('R5').value, 30000),   `NE R5 varor/material = 30 000 (fick ${get('R5').value})`);
    assert(near(get('R6').value, 12000),   `NE R6 övriga externa = 12 000 (fick ${get('R6').value})`);
    assert(near(get('R43').value, 10000),  `NE R43 egenavgifter (8422) = 10 000 (fick ${get('R43').value})`);
    assert(near(get('R11').value, 100000 + 5000 - 30000 - 12000),
      `NE R11 bokfört resultat = 63 000 (fick ${get('R11').value})`);
    // R8 exkluderar 8422 (egenavgifter är inte räntekostnad)
    assert(near(get('R8').value, 0), `NE R8 räntekostnader = 0 — 8422 exkluderad (fick ${get('R8').value})`);
    assert(near(get('R47').value, 63000 - 10000), `NE R47 överskott = 53 000 (fick ${get('R47').value})`);
    assert(near(get('R48').value, 0), 'NE R48 underskott = 0 vid överskott');
    // Balansposter (ackumulerat per bokslutsdagen)
    assert(near(get('B9').value, 88000), `NE B9 kassa/bank = 88 000 (fick ${get('B9').value})`);
    assert(near(get('B14').value, 35000), `NE B14 skatteskulder (moms 2610 + 2514) = 35 000 (fick ${get('B14').value})`);
    assert(near(get('B10').value, 0), 'NE B10 eget kapital = 0 utan EK-transaktioner');
    // Verifierade fältkoder ur BAS kopplingstabell
    assert(get('R1').sruCode === '7400' && get('R11').sruCode === '7440' && get('B9').sruCode === '7280',
      'NE: fältkoder enligt BAS kopplingstabell (R1=7400, R11=7440, B9=7280)');
    assert(get('R43').sruCode === undefined, 'NE: R43 saknar fältkod (ej i kopplingstabellen)');
    // Momskonton (2610) påverkar aldrig NE-raderna
    assert(rows.every(r => r.kind === 'computed' || r.adjusted === false), 'NE: inga rader justerade i grundläge'); }

  // ── Årsfiltrering ──────────────────────────────────────────────────────
  { const rows2026 = buildNeRows(neVouchers, neTxs, 2026);
    const r1 = rows2026.find(r => r.id === 'R1')!;
    assert(near(r1.value, 50000), `NE 2026: R1 = 50 000 — åren blandas inte (fick ${r1.value})`);
    // Balansen 2026 inkluderar däremot tidigare år (ackumulerat)
    const b9 = rows2026.find(r => r.id === 'B9')!;
    assert(near(b9.value, 88000 + 50000), `NE 2026: B9 ackumulerar föregående år (fick ${b9.value})`); }

  // ── Manuell justering + omräkning av summarader ───────────────────────
  { const rows = buildNeRows(neVouchers, neTxs, 2025, {
      R1:  { value: 90000, note: 'Rättelse: privat andel' },
      R13: { value: 2000 },
    });
    const get = (id: string) => rows.find(r => r.id === id)!;
    assert(get('R1').value === 90000 && get('R1').adjusted, 'Justering: R1 använder manuellt värde');
    assert(near(get('R1').auto, 100000), 'Justering: bokfört värde bevaras som referens');
    assert(get('R1').note === 'Rättelse: privat andel', 'Justering: anteckning följer med');
    assert(near(get('R11').value, 90000 + 5000 - 30000 - 12000),
      `Justering: R11 räknas om från justerade värden (fick ${get('R11').value})`);
    assert(near(get('R47').value, 53000 - 10000 + 2000),
      `Justering: R47 = R11 + R13 − R43 = 45 000 (fick ${get('R47').value})`); }

  // ── Underskott → R48 ───────────────────────────────────────────────────
  { const rows = buildNeRows(neVouchers, neTxs, 2025, { R6: { value: 80000 } });
    const get = (id: string) => rows.find(r => r.id === id)!;
    assert(near(get('R48').value, 80000 - 12000 - 53000), // nytt resultat: 63000−68000−10000 = −15000
      `Underskott: R48 = 15 000 (fick ${get('R48').value})`);
    assert(near(get('R47').value, 0), 'Underskott: R47 = 0'); }

  // ── Avrundning till hela kronor ───────────────────────────────────────
  { await addVoucher('2025-07-01', 'Öresförsäljning', [
      { accountId: 1930, amount: 100.49 },
      { accountId: 3040, amount: -100.49 },
    ]);
    const rows = buildNeRows(await db.vouchers.toArray(), await db.transactions.toArray(), 2025);
    const r2 = rows.find(r => r.id === 'R2')!;
    assert(Number.isInteger(r2.value), `Avrundning: R2 är hela kronor (fick ${r2.value})`); }

  // ── Persistens ─────────────────────────────────────────────────────────
  await saveAdjustment(2025, 'R1', { value: 95000, note: 'Test' });
  { const dec = await getDeclaration(2025);
    assert(dec !== undefined && dec.fields.R1?.value === 95000 && dec.status === 'draft',
      'Persistens: justering sparad med status draft'); }
  await saveAdjustment(2025, 'R13', { value: 500 });
  { const dec = await getDeclaration(2025);
    assert(dec?.fields.R1?.value === 95000 && dec?.fields.R13?.value === 500,
      'Persistens: flera justeringar samexisterar'); }
  await saveAdjustment(2025, 'R1', null);
  { const dec = await getDeclaration(2025);
    assert(dec?.fields.R1 === undefined && dec?.fields.R13?.value === 500,
      'Persistens: null återställer raden utan att röra andra'); }
  await setDeclarationStatus(2025, 'klar');
  { const dec = await getDeclaration(2025);
    assert(dec?.status === 'klar', 'Persistens: status klar sparas'); }

  // ── Utskriftsvy ────────────────────────────────────────────────────────
  { const rows = buildNeRows(neVouchers, neTxs, 2025, { R1: { value: 90000, note: 'Privat andel' } });
    const html = renderNePrintHtml(2025, rows, 'Enkla Firman');
    assert(html.includes('NE-bilagan') && html.includes('2025'), 'Utskrift: rubrik med beskattningsår');
    assert(html.includes('Enkla Firman'), 'Utskrift: företagsnamn med');
    assert(html.includes('R11'), 'Utskrift: summarad R11 med');
    assert(html.includes('Privat andel'), 'Utskrift: justeringsanteckning med');
    assert(html.includes('<script') === false, 'Utskrift: ingen oescapad HTML'); }

  // ═══════════════════════════════════════════════════════════════════════
  // 20. SRU-EXPORT AV NE-DEKLARATION (M2)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 20. SRU-export av NE ──────────────────────────────\n');

  // Bygger vidare på bokföringen från sektion 19 (2025 + öresförsäljning)
  const m2Vouchers = await db.vouchers.toArray();
  const m2Txs      = await db.transactions.toArray();
  const m2Rows     = buildNeRows(m2Vouchers, m2Txs, 2025);
  const m2Company  = {
    ...DEFAULT_COMPANY,
    name: 'Enkla Firman', orgnr: '165560000167',
    address: 'Storgatan 1\n111 22 Stockholm', email: 'ef@example.se',
  };
  const m2Input = {
    taxYear: 2025, rows: m2Rows, company: m2Company,
    createdAt: { date: '20260708', time: '160000' },
    program: { name: 'LokalBokforing', version: '2.0' },
  };

  // ── Paketbygge — verifierade fältkoder ur BAS kopplingstabell ──────────
  { const pkg = buildNeSruPackage(m2Input);
    assert(pkg.blanketter.length === 1, 'NE-SRU: exakt en blankett');
    const b = pkg.blanketter[0];
    assert(b.formCode === NE_FORM_CODE(2025), `NE-SRU: blankettkod ${NE_FORM_CODE(2025)}`);
    const get = (code: string) => b.uppgifter.find(u => u.fieldCode === code);
    assert(get('7011')?.value === '2025-01-01', 'NE-SRU: 7011 räkenskapsår från');
    assert(get('7012')?.value === '2025-12-31', 'NE-SRU: 7012 räkenskapsår till');
    assert(get('7400')?.value === '100000', `NE-SRU: R1 → 7400 = 100000 (fick ${get('7400')?.value})`);
    assert(get('7440') !== undefined && Number(get('7440')!.value) > 0,
      `NE-SRU: R11 bokfört resultat → 7440 (fick ${get('7440')?.value})`);
    assert(get('7280') !== undefined && Number(get('7280')!.value) > 0, 'NE-SRU: B9 kassa/bank → 7280');
    assert(get('7381') !== undefined, 'NE-SRU: B14 skatteskulder → 7381');
    // Justeringsrader utan verifierad kod exporteras INTE (R43/R47/R48 m.fl.)
    assert(b.uppgifter.every(u => !['7143', '7147', '7148', '7101'].includes(u.fieldCode)),
      'NE-SRU: ingen platshållarkod eller overifierad justeringsrad i filen');
    // Nollrader utelämnas: R7 personal = 0 → ingen uppgiftsrad
    assert(get('7502') === undefined, 'NE-SRU: nollrad (R7 → 7502) utelämnas');
    // Adressen tar bara första raden (SRU-värden får inte innehålla radbrytning)
    assert(pkg.sender.address === 'Storgatan 1', 'NE-SRU: flerradsadress trunkeras till första raden'); }

  // ── Serialisering av byggt paket ───────────────────────────────────────
  { const pkg = buildNeSruPackage(m2Input);
    const files = serialize(pkg);
    const text = decodeLatin1(files.blanketter);
    assert(text.startsWith('#BLANKETT NE-2025P4'),
      'NE-SRU: blankettkod NE-2025P4 (P-suffix från SKV 2161 utgåva 13)');
    assert(text.includes('#IDENTITET 165560000167 20260708 160000'), 'NE-SRU: #IDENTITET med personnummer + frusen tidsstämpel');
    assert(text.includes('#UPPGIFT 7011 2025-01-01'), 'NE-SRU: #UPPGIFT-rad med datumvärde');
    assert((text.match(/#FIL_SLUT/g) ?? []).length === 1, 'NE-SRU: exakt en #FIL_SLUT');
    const info = decodeLatin1(files.info);
    assert(info.includes('#ORGNR 165560000167') && info.includes('#NAMN Enkla Firman'),
      'NE-SRU: INFO.SRU med uppgiftslämnare'); }

  // ── Justeringar följer med i exporten ──────────────────────────────────
  { const adjRows = buildNeRows(m2Vouchers, m2Txs, 2025, { R1: { value: 90000 } });
    const pkg = buildNeSruPackage({ ...m2Input, rows: adjRows });
    const r1 = pkg.blanketter[0].uppgifter.find(u => u.fieldCode === '7400');
    assert(r1?.value === '90000', 'NE-SRU: manuellt justerad rad exporteras med justerat värde'); }

  // ── Ogiltiga företagsuppgifter stoppas vid serialisering ──────────────
  { const pkg = buildNeSruPackage({ ...m2Input, company: { ...m2Company, orgnr: '5560000168' } });
    let code = '';
    try { serialize(pkg); } catch (e) { code = e instanceof SruError ? e.code : 'ANNAT'; }
    assert(code === 'SRU-ORGNR-01', 'NE-SRU: ogiltigt orgnr stoppas med SRU-ORGNR-01'); }

  // ── Inlämningsspårning ─────────────────────────────────────────────────
  await setSubmissionStep(2025, 'exportedAt', '2026-07-08');
  await setSubmissionStep(2025, 'uploadedAt', '2026-07-09');
  { const dec = await getDeclaration(2025);
    assert(dec?.submission?.exportedAt === '2026-07-08' && dec?.submission?.uploadedAt === '2026-07-09',
      'Inlämning: exporterad + uppladdad spåras'); }
  await setSubmissionStep(2025, 'uploadedAt', null);
  { const dec = await getDeclaration(2025);
    assert(dec?.submission?.uploadedAt === undefined && dec?.submission?.exportedAt === '2026-07-08',
      'Inlämning: steg kan ångras utan att röra andra steg');
    assert(dec?.fields.R13?.value === 500, 'Inlämning: justeringar orörda av submission-uppdateringar'); }

  // ═══════════════════════════════════════════════════════════════════════
  // 21. INK2 — AKTIEBOLAG (M3)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 21. INK2 aktiebolag ───────────────────────────────\n');

  await resetDb();

  // År 2024: aktiekapital sätts in (ska ingå i balansen 2025 men inte resultatet)
  // 2081 = Aktiekapital (AB) — 2010 är delägarkonto för EF och mappas inte på INK2
  await addVoucher('2024-01-10', 'Aktiekapital', [
    { accountId: 1930, amount: 25000 },
    { accountId: 2081, amount: -25000 },
  ]);
  // År 2025: försäljning 200 000 + moms, kostnader 80 000, kundfordran 50 000
  await addVoucher('2025-02-01', 'Försäljning kontant', [
    { accountId: 1930, amount: 250000 },
    { accountId: 3000, amount: -200000 },
    { accountId: 2610, amount: -50000 },
  ]);
  await addVoucher('2025-03-01', 'Kundfaktura obetald', [
    { accountId: 1510, amount: 50000 },
    { accountId: 3000, amount: -40000 },
    { accountId: 2610, amount: -10000 },
  ]);
  await addVoucher('2025-04-01', 'Externa kostnader', [
    { accountId: 6110, amount: 80000 },
    { accountId: 1930, amount: -80000 },
  ]);

  const abVouchers = await db.vouchers.toArray();
  const abTxs      = await db.transactions.toArray();

  { const rows = buildInk2Rows(abVouchers, abTxs, 2025);
    const get = (id: string) => rows.find(r => r.id === id)!;
    // Resultat: enbart 2025 — officiell postnumrering
    assert(near(get('3.1').value, 240000), `INK2 3.1 nettoomsättning = 240 000 (fick ${get('3.1').value})`);
    assert(near(get('3.7').value, 80000),  `INK2 3.7 övriga externa kostnader = 80 000 (fick ${get('3.7').value})`);
    assert(near(get('RR').value, 160000), `INK2 årets resultat = 160 000 (fick ${get('RR').value})`);
    // Balans: ackumulerat inkl. 2024 (aktiekapital + bank)
    assert(near(get('2.26').value, 25000 + 250000 - 80000), `INK2 2.26 kassa/bank inkl. föregående år (fick ${get('2.26').value})`);
    assert(near(get('2.19').value, 50000), `INK2 2.19 kundfordringar = 50 000 (fick ${get('2.19').value})`);
    assert(near(get('2.27').value, 25000), `INK2 2.27 bundet eget kapital (2081) = 25 000 (fick ${get('2.27').value})`);
    assert(near(get('2.48').value, 60000), `INK2 2.48 övriga kortfristiga skulder (moms) = 60 000 (fick ${get('2.48').value})`);
    // Verifierade fältkoder ur BAS kopplingstabell
    assert(get('3.1').sruCode === '7410' && get('2.26').sruCode === '7281' && get('2.49').sruCode === '7368',
      'INK2: fältkoder enligt BAS kopplingstabell (3.1=7410, 2.26=7281, 2.49=7368)');
    // Balansekvation: TS = ES (ES inkluderar årets resultat)
    assert(near(get('TS').value, get('ES').value),
      `INK2 balanserar: TS ${get('TS').value} = ES ${get('ES').value}`);
    // INK2S: J1 = RR; JR utan justeringar = J1
    assert(near(get('J1').value, 160000), 'INK2 J1 bokfört resultat = RR');
    assert(near(get('JR').value, 160000), 'INK2 JR skattemässigt resultat utan justeringar = J1'); }

  // ── Skattemässiga justeringar ──────────────────────────────────────────
  { const rows = buildInk2Rows(abVouchers, abTxs, 2025, {
      J2: { value: 5000, note: 'Representation ej avdragsgill' },
      J3: { value: 2000 },
    });
    const get = (id: string) => rows.find(r => r.id === id)!;
    assert(near(get('JR').value, 160000 + 5000 - 2000),
      `INK2 JR = 163 000 med justeringar (fick ${get('JR').value})`); }

  // ── SRU-paket — endast INK2R (verifierade koder) ───────────────────────
  { const rows = buildInk2Rows(abVouchers, abTxs, 2025);
    const pkg = buildInk2SruPackage({
      taxYear: 2025, rows,
      company: { ...DEFAULT_COMPANY, name: 'Exempel AB', orgnr: '165560000167' },
      createdAt: { date: '20260708', time: '170000' },
      program: { name: 'LokalBokforing', version: '2.0' },
    });
    assert(pkg.blanketter.length === 1, 'INK2-SRU: endast INK2R exporteras (INK2S saknar kontomappade koder)');
    assert(pkg.blanketter[0].formCode === INK2R_FORM_CODE(2025), `INK2-SRU: blankettkod ${INK2R_FORM_CODE(2025)}`);
    const b = pkg.blanketter[0];
    const get = (code: string) => b.uppgifter.find(u => u.fieldCode === code);
    assert(get('7011')?.value === '2025-01-01', 'INK2-SRU: period på INK2R');
    assert(get('7410')?.value === '240000', `INK2-SRU: 3.1 → 7410 = 240000 (fick ${get('7410')?.value})`);
    assert(get('7281')?.value === '195000', 'INK2-SRU: 2.26 kassa/bank → 7281');
    assert(get('7450')?.value === '160000', 'INK2-SRU: årets vinst → 7450 (3.26)');
    assert(get('7550') === undefined, 'INK2-SRU: förlustkoden 7550 utelämnas vid vinst');
    // Nollrader utelämnas (t.ex. 2.13 råvaror)
    assert(get('7241') === undefined, 'INK2-SRU: nollrad (2.13 råvaror) utelämnas');
    const files = serialize(pkg);
    const text = decodeLatin1(files.blanketter);
    assert(text.includes(`#BLANKETT ${INK2R_FORM_CODE(2025)}`), 'INK2-SRU: INK2R serialiseras');
    assert((text.match(/#FIL_SLUT/g) ?? []).length === 1, 'INK2-SRU: exakt en #FIL_SLUT'); }

  // ── Nettoposter: fältkod väljs efter tecken ────────────────────────────
  { const rowsPlus = buildInk2Rows(abVouchers, abTxs, 2025, { '3.2': { value: 5000 } });
    const rowsMinus = buildInk2Rows(abVouchers, abTxs, 2025, { '3.2': { value: -5000 } });
    const mk = (rows2: typeof rowsPlus) => buildInk2SruPackage({
      taxYear: 2025, rows: rows2,
      company: { ...DEFAULT_COMPANY, name: 'Exempel AB', orgnr: '165560000167' },
      createdAt: { date: '20260708', time: '170000' },
      program: { name: 'LokalBokforing', version: '2.0' },
    }).blanketter[0].uppgifter;
    const plus = mk(rowsPlus);
    const minus = mk(rowsMinus);
    assert(plus.some(u => u.fieldCode === '7411' && u.value === '5000'), 'INK2-SRU: 3.2 positiv → pluskod 7411');
    assert(!plus.some(u => u.fieldCode === '7510'), 'INK2-SRU: 3.2 positiv → ingen minuskod');
    assert(minus.some(u => u.fieldCode === '7510' && u.value === '5000'), 'INK2-SRU: 3.2 negativ → minuskod 7510 med absolutbelopp');
    assert(!minus.some(u => u.fieldCode === '7411'), 'INK2-SRU: 3.2 negativ → ingen pluskod'); }

  // ── Typad persistens: NE och INK2 samexisterar per år ─────────────────
  await saveAdjustment(2025, 'J2', { value: 5000 }, 'INK2');
  await saveAdjustment(2025, 'R13', { value: 111 }, 'NE');
  { const ink2 = await getDeclaration(2025, 'INK2');
    const ne   = await getDeclaration(2025, 'NE');
    assert(ink2?.fields.J2?.value === 5000 && ink2.type === 'INK2', 'Persistens: INK2-justering på egen post');
    assert(ne?.fields.R13?.value === 111 && ne.type === 'NE', 'Persistens: NE-justering separat från INK2');
    assert(ink2?.id !== ne?.id, 'Persistens: NE och INK2 är olika deklarationsposter'); }
  await setSubmissionStep(2025, 'exportedAt', '2026-07-08', 'INK2');
  { const ink2 = await getDeclaration(2025, 'INK2');
    const ne   = await getDeclaration(2025, 'NE');
    assert(ink2?.submission?.exportedAt === '2026-07-08', 'Persistens: INK2-inlämningssteg spåras');
    assert(ne?.submission?.exportedAt === undefined, 'Persistens: NE-inlämning opåverkad av INK2'); }

  // ═══════════════════════════════════════════════════════════════════════
  // 22. AI-HJÄLP & ONBOARDING
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n── 22. AI-hjälp & onboarding ─────────────────────────\n');

  await resetDb();

  // ── Nyckelinställningar ────────────────────────────────────────────────
  { const s = await getAiSettings();
    assert(s.apiKey === '' && s.validatedAt === undefined, 'AI: tom standardinställning'); }

  { const noKey = { apiKey: '' };
    const unvalidated = { apiKey: 'AIzaTest123' };
    const valid = { apiKey: 'AIzaTest123', validatedAt: '2026-07-08' };
    assert(!hasValidKey(noKey), 'AI: tom nyckel är inte giltig');
    assert(!hasValidKey(unvalidated), 'AI: ovaliderad nyckel är inte giltig — kräver testanrop');
    assert(hasValidKey(valid), 'AI: validerad nyckel är giltig');
    assert(gateMessage(noKey) === NO_KEY_REPLY, 'AI: boten svarar med nyckelinstruktion utan nyckel');
    assert(gateMessage(unvalidated) === NO_KEY_REPLY, 'AI: boten kräver VALIDERAD nyckel');
    assert(gateMessage(valid) === null, 'AI: ingen spärr med validerad nyckel');
    assert(NO_KEY_REPLY.includes('aistudio.google.com'), 'AI: instruktionen berättar var man hämtar nyckel');
    assert(NO_KEY_REPLY.includes('lokalt'), 'AI: instruktionen förklarar lokal lagring'); }

  await saveAiSettings({ apiKey: 'AIzaSparad', validatedAt: '2026-07-08' });
  { const s = await getAiSettings();
    assert(s.apiKey === 'AIzaSparad' && s.validatedAt === '2026-07-08', 'AI: inställningar sparas och läses'); }

  // ── Systemprompt ───────────────────────────────────────────────────────
  { const prompt = buildSystemPrompt({
      accounts: await db.accounts.toArray(),
      voucherCount: 5, invoiceCount: 2, years: [2026, 2025],
    });
    assert(prompt.includes('1930 Företagskonto / Bank'), 'AI-prompt: kontoplanen ingår');
    assert(prompt.includes('5 verifikationer') && prompt.includes('2026, 2025'), 'AI-prompt: användarens data ingår');
    assert(prompt.includes('fakturametoden') && prompt.includes('Mina sidor'), 'AI-prompt: appguiden ingår');
    assert(prompt.includes('inte professionell rådgivning'), 'AI-prompt: rådgivningsdisclaimer ingår');
    assert(prompt.includes('svenska'), 'AI-prompt: svarar på svenska'); }

  // ── Onboarding-flagga ──────────────────────────────────────────────────
  assert((await isOnboardingDone()) === false, 'Onboarding: visas för nya användare');
  await markOnboardingDone();
  assert((await isOnboardingDone()) === true, 'Onboarding: flaggan sparas — visas inte igen');

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
