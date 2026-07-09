import { db } from '../db';
import { splitVat, VAT_OUT, VAT_IN } from './vat';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VatRate = 0 | 6 | 12 | 25;

export interface GeminiRow {
  date: string;                          // YYYY-MM-DD
  description: string;
  amount: number;                        // gross (inkl. moms)
  vat_rate: VatRate;
  category?: string;
  suggested_account?: number;
  type?: 'expense' | 'revenue';          // default: expense
}

export type ResolveSource = 'gemini' | 'dict' | 'history' | 'none';

export interface DraftRow {
  row: GeminiRow;
  resolvedAccount: number | null;
  resolveSource: ResolveSource;
}

// ── Parser ────────────────────────────────────────────────────────────────────

// Strips optional ```json … ``` markdown fences, then JSON.parse
export function parseGeminiJson(raw: string): unknown[] {
  const stripped = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/,           '')
    .trim();
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed)) throw new Error('JSON måste vara en array av objekt [ … ].');
  return parsed;
}

const VALID_VAT = new Set([0, 6, 12, 25]);

// Gemini svarar ofta på svenska trots engelsk prompt. Vi accepterar därför både
// engelska och svenska fältnamn så att användaren slipper översätta JSON:en för
// hand. Första nyckeln i listan som finns (och inte är tom) vinner.
const FIELD_ALIASES: Record<keyof GeminiRow, string[]> = {
  date:              ['date', 'datum'],
  description:       ['description', 'beskrivning', 'text'],
  amount:            ['amount', 'belopp', 'summa'],
  vat_rate:          ['vat_rate', 'vatRate', 'moms', 'momssats'],
  category:          ['category', 'kategori'],
  suggested_account: ['suggested_account', 'suggestedAccount', 'konto', 'kontonummer', 'account'],
  type:              ['type', 'typ'],
};

function pick(o: Record<string, unknown>, field: keyof GeminiRow): unknown {
  for (const key of FIELD_ALIASES[field]) {
    const v = o[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// Tolerant taltolkning: Gemini skriver ibland belopp/moms som sträng med svensk
// decimalkomma, tusentalsmellanslag eller enhetssuffix ("2 500,00 kr", "25 %").
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[\s%]|kr|sek/gi, '').replace(',', '.');
    if (cleaned === '') return NaN;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

// Ord som betyder "intäkt" — allt annat tolkas som kostnad (default).
const REVENUE_WORDS = new Set([
  'revenue', 'income', 'intäkt', 'intakt', 'inkomst', 'inbetalning', 'försäljning', 'forsaljning',
]);

export function validateRows(rows: unknown[]): GeminiRow[] {
  return rows.map((r, i) => {
    const n = i + 1;
    if (typeof r !== 'object' || r === null) throw new Error(`Rad ${n}: inte ett objekt.`);
    const o = r as Record<string, unknown>;

    const date = pick(o, 'date');
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error(`Rad ${n}: 'date'/'datum' saknas eller har fel format (YYYY-MM-DD).`);

    const description = pick(o, 'description');
    if (typeof description !== 'string' || !description.trim())
      throw new Error(`Rad ${n}: 'description'/'beskrivning' saknas.`);

    const amount = toNumber(pick(o, 'amount'));
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error(`Rad ${n}: 'amount'/'belopp' måste vara ett positivt tal.`);

    const vat = toNumber(pick(o, 'vat_rate') ?? 0);
    if (!VALID_VAT.has(vat))
      throw new Error(`Rad ${n}: 'vat_rate'/'momssats' måste vara 0, 6, 12 eller 25.`);

    const category = pick(o, 'category');
    const account  = toNumber(pick(o, 'suggested_account'));
    const typeRaw  = pick(o, 'type');
    const isRevenue = typeof typeRaw === 'string' && REVENUE_WORDS.has(typeRaw.trim().toLowerCase());

    return {
      date,
      description:       description.trim(),
      amount,
      vat_rate:          vat as VatRate,
      category:          typeof category === 'string' ? category.toLowerCase() : undefined,
      suggested_account: Number.isFinite(account) && account > 0 ? account : undefined,
      type:              isRevenue ? 'revenue' : 'expense',
    };
  });
}

// ── Account mapping ───────────────────────────────────────────────────────────

// Keyword → BAS account. Matched against category + description (case-insensitive).
// VIKTIGT: varje målkonto MÅSTE finnas i defaultAccounts (db.ts) — annars bokförs
// verifikationen tyst mot ett konto som inte finns. Testerna vaktar invarianten.
export const CATEGORY_MAP: Record<string, number> = {
  representation: 6071, fika:         6071, kaffe:    6071,
  lunch:          6071, middag:       6071, restaurang: 6071,
  programvara:    5420, mjukvara:     5420, saas:     5420,
  abonnemang:     5420, prenumeration:5420, licens:   5420,
  kontorsmaterial:6110, papper:       6110,
  telefon:        6212, mobiltelefon: 6212,
  internet:       6230, bredband:     6230, datakommunikation: 6230,
  hyra:           5010, lokalhyra:    5010, lokal:    5010,
  städning:       5060,
  bank:           6570, bankkostnad:  6570, bankavgift:6570,
  redovisning:    6530, bokföring:    6530, revisor:  6530,
  konsult:        6550, försäkring:   6310,
  porto:          6250, frimärke:     6250,
  transport:      5800, resa:         5800, tåg:      5800,
  flyg:           5800, taxi:         5800, buss:     5800, parkering: 5800,
  hotell:         5831, hotel:        5831, logi:     5831, övernattning: 5831,
  marknadsföring: 5910, reklam:       5910, annonsering:5910,
  tidning:        6970, facklitteratur:6970,
  ränta:          8410, räntekostnad: 8410,
  försäljning:    3000, intäkt:       3000,
  inköp:          4000, varor:        4000, material: 4000,
  förbrukning:    5410, inventarier:  5410,
};

export function lookupDict(row: GeminiRow): number | null {
  const text = `${row.category ?? ''} ${row.description}`.toLowerCase();
  for (const [kw, acc] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(kw)) return acc;
  }
  return null;
}

// Accounts that carry VAT/system postings — never suggested as main account.
const SYSTEM_ACCOUNTS = new Set([1930, 1910, 2610, 2620, 2630, 2640, 2514, 8422]);

type VoucherLike = { id?: number; description: string };

export async function lookupHistory(
  description: string,
  allVouchers?: VoucherLike[],
): Promise<number | null> {
  const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return null;

  // Anroparen kan skicka in förladdade vouchers — undviker en tabellskanning per rad
  const vouchers = allVouchers ?? await db.vouchers.toArray();
  const matched  = vouchers.filter(v => words.some(w => v.description.toLowerCase().includes(w)));
  if (matched.length === 0) return null;

  const txs = await db.transactions
    .where('voucherId').anyOf(matched.map(v => v.id!)).toArray();

  const freq = new Map<number, number>();
  for (const t of txs) {
    if (!SYSTEM_ACCOUNTS.has(t.accountId))
      freq.set(t.accountId, (freq.get(t.accountId) ?? 0) + 1);
  }
  if (freq.size === 0) return null;
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export async function resolveAccount(
  row: GeminiRow,
  allVouchers?: VoucherLike[],
): Promise<{ account: number | null; source: ResolveSource }> {
  if (row.suggested_account) return { account: row.suggested_account, source: 'gemini' };
  const dict = lookupDict(row);
  if (dict !== null)           return { account: dict, source: 'dict' };
  const hist = await lookupHistory(row.description, allVouchers);
  if (hist !== null)           return { account: hist, source: 'history' };
  return { account: null, source: 'none' };
}

export async function toDraftRows(rows: GeminiRow[]): Promise<DraftRow[]> {
  const allVouchers = await db.vouchers.toArray();
  return Promise.all(rows.map(async row => {
    const { account, source } = await resolveAccount(row, allVouchers);
    return { row, resolvedAccount: account, resolveSource: source };
  }));
}

// ── Voucher builder ───────────────────────────────────────────────────────────

export function buildVoucherLines(
  row: GeminiRow,
  mainAccount: number,
): { accountId: number; amount: number }[] {
  const gross     = row.amount;
  const rate      = row.vat_rate;
  const isRevenue = mainAccount >= 3000 && mainAccount <= 3999;

  if (rate === 0) {
    return isRevenue
      ? [{ accountId: 1930, amount: gross }, { accountId: mainAccount, amount: -gross }]
      : [{ accountId: mainAccount, amount: gross }, { accountId: 1930, amount: -gross }];
  }

  const { net, vat } = splitVat(gross, rate);
  if (isRevenue) {
    return [
      { accountId: 1930,        amount:  gross },
      { accountId: mainAccount, amount: -net   },
      { accountId: VAT_OUT[rate], amount: -vat },
    ];
  }
  return [
    { accountId: mainAccount, amount:  net  },
    { accountId: VAT_IN,      amount:  vat  },
    { accountId: 1930,        amount: -gross },
  ];
}

// ── Persist ───────────────────────────────────────────────────────────────────

export async function bookDraftRows(
  approved: { row: GeminiRow; account: number }[],
): Promise<number> {
  let count = 0;
  await db.transaction('rw', db.vouchers, db.transactions, async () => {
    for (const { row, account } of approved) {
      const lines = buildVoucherLines(row, account);
      const vid   = await db.vouchers.add({
        date: row.date, description: row.description, created_at: Date.now(),
      });
      await db.transactions.bulkAdd(lines.map(l => ({ ...l, voucherId: vid })));
      count++;
    }
  });
  return count;
}
