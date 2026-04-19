import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const VAT_OUT: Record<number, number> = { 6: 2630, 12: 2620, 25: 2610 };
const VAT_IN = 2640;

function splitVat(gross: number, rate: number) {
  const vat = Math.round(gross * rate / (100 + rate) * 100) / 100;
  return { net: Math.round((gross - vat) * 100) / 100, vat };
}

type Row = { accountId: number | string; debit: string; credit: string };

const cls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 ' +
  'focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400';

export function VoucherEntry({ editId, onEditDone }: { editId?: number | null; onEditDone?: () => void }) {
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray());

  const [date, setDate]               = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [rows, setRows]               = useState<Row[]>([
    { accountId: '', debit: '', credit: '' },
    { accountId: '', debit: '', credit: '' },
  ]);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [saving,  setSaving]  = useState(false);

  // Load existing voucher when editId changes
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const v  = await db.vouchers.get(editId);
      const ts = await db.transactions.where('voucherId').equals(editId).toArray();
      if (!v) return;
      setDate(v.date);
      setDescription(v.description);
      setRows(ts.map(t => ({
        accountId: t.accountId,
        debit:  t.amount > 0 ? String(t.amount) : '',
        credit: t.amount < 0 ? String(Math.abs(t.amount)) : '',
      })));
      setError(''); setSuccess('');
    })();
  }, [editId]);

  // VAT helper
  const [vatRate, setVatRate] = useState<0 | 6 | 12 | 25>(0);
  const [vatDir,  setVatDir]  = useState<'out' | 'in'>('out');
  const [vatGross, setVatGross] = useState('');

  const grossNum = parseFloat(vatGross) || 0;
  const { net, vat } = vatRate > 0 ? splitVat(grossNum, vatRate) : { net: grossNum, vat: 0 };

  const applyVat = () => {
    if (!vatRate || !grossNum) return;
    const vatAcc = vatDir === 'out' ? VAT_OUT[vatRate] : VAT_IN;
    setRows(
      vatDir === 'out'
        ? [
            { accountId: 1930,   debit: String(grossNum), credit: '' },
            { accountId: '',     debit: '',                credit: String(net) },
            { accountId: vatAcc, debit: '',                credit: String(vat) },
          ]
        : [
            { accountId: '',     debit: String(net),  credit: '' },
            { accountId: vatAcc, debit: String(vat),  credit: '' },
            { accountId: 1930,   debit: '',            credit: String(grossNum) },
          ],
    );
    setVatGross('');
  };

  const addRow    = () => setRows(r => [...r, { accountId: '', debit: '', credit: '' }]);
  const removeRow = (i: number) => { if (rows.length > 2) setRows(r => r.filter((_, j) => j !== i)); };

  const updateRow = (i: number, field: keyof Row, value: string | number) =>
    setRows(r => {
      const n = r.map((row, j) => j !== i ? row : { ...row, [field]: value });
      if (field === 'debit'  && value !== '') n[i].credit = '';
      if (field === 'credit' && value !== '') n[i].debit  = '';
      return n;
    });

  const totalDebit  = rows.reduce((s, r) => s + (parseFloat(r.debit  as string) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit as string) || 0), 0);
  const diff        = Math.round((totalDebit - totalCredit) * 100) / 100;
  const valid       = rows.filter(r => r.accountId && (r.debit || r.credit));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!date || !description) { setError('Datum och beskrivning krävs.'); return; }
    if (valid.length < 2)      { setError('Minst två konteringsrader krävs.'); return; }
    if (Math.abs(diff) > 0.01) {
      setError(`Debet och kredit balanserar inte — differens: ${diff.toFixed(2)} kr`);
      return;
    }
    setSaving(true);
    try {
      await db.transaction('rw', db.vouchers, db.transactions, async () => {
        if (editId) {
          await db.vouchers.update(editId, { date, description });
          await db.transactions.where('voucherId').equals(editId).delete();
          for (const row of valid) {
            const d = parseFloat(row.debit  as string) || 0;
            const c = parseFloat(row.credit as string) || 0;
            await db.transactions.add({ voucherId: editId, accountId: Number(row.accountId), amount: d > 0 ? d : -c });
          }
        } else {
          const vid = await db.vouchers.add({ date, description, created_at: Date.now() });
          for (const row of valid) {
            const d = parseFloat(row.debit  as string) || 0;
            const c = parseFloat(row.credit as string) || 0;
            await db.transactions.add({ voucherId: vid, accountId: Number(row.accountId), amount: d > 0 ? d : -c });
          }
        }
      });
      setSuccess(editId ? 'Verifikation uppdaterad.' : 'Verifikation bokförd.');
      if (!editId) {
        setDescription('');
        setVatRate(0);
        setRows([
          { accountId: '', debit: '', credit: '' },
          { accountId: '', debit: '', credit: '' },
        ]);
      }
      onEditDone?.();
      setTimeout(() => setSuccess(''), 4000);
    } catch {
      setError('Kunde inte spara. Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        {editId ? `Redigera verifikat ${editId}` : 'Ny verifikation'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Date + description */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Datum</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={cls} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Beskrivning</label>
            <input
              type="text" required value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="T.ex. Inköp kontorsmaterial"
              className={cls}
            />
          </div>
        </div>

        {/* VAT helper */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Momshjälp</p>

          <div className="flex flex-wrap gap-3 items-end">
            {/* Rate */}
            <div>
              <label className="mb-1 block text-xs text-slate-500">Momssats</label>
              <select
                value={vatRate}
                onChange={e => setVatRate(Number(e.target.value) as 0 | 6 | 12 | 25)}
                className={cls + ' w-36'}
              >
                <option value={0}>Ingen moms</option>
                <option value={6}>6 %</option>
                <option value={12}>12 %</option>
                <option value={25}>25 %</option>
              </select>
            </div>

            {vatRate > 0 && (
              <>
                {/* Direction */}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Typ</label>
                  <select value={vatDir} onChange={e => setVatDir(e.target.value as 'out' | 'in')} className={cls + ' w-48'}>
                    <option value="out">Utgående (försäljning)</option>
                    <option value="in">Ingående (inköp)</option>
                  </select>
                </div>

                {/* Gross amount */}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Belopp inkl. moms</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={vatGross}
                    onChange={e => setVatGross(e.target.value)}
                    placeholder="0.00"
                    className={cls + ' w-36'}
                  />
                </div>

                {/* Preview */}
                {grossNum > 0 && (
                  <div className="text-sm text-slate-500 self-end pb-2">
                    Netto <span className="font-semibold text-slate-900">{net.toFixed(2)} kr</span>
                    {' + '}moms <span className="font-semibold text-slate-900">{vat.toFixed(2)} kr</span>
                  </div>
                )}

                {/* Apply button */}
                <button
                  type="button"
                  onClick={applyVat}
                  disabled={!grossNum}
                  className="self-end rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  Fyll i rader
                </button>
              </>
            )}
          </div>

          {vatRate > 0 && grossNum > 0 && (
            <p className="text-xs text-slate-400">
              Klicka "Fyll i rader" — välj sedan konto för {vatDir === 'out' ? 'intäkt' : 'kostnad'} i tabellen nedan.
            </p>
          )}
        </div>

        {/* Rows */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Konto</th>
                <th className="w-32 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Debet</th>
                <th className="w-32 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Kredit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-100 first:border-0">
                  <td className="px-4 py-2">
                    <select value={row.accountId} onChange={e => updateRow(i, 'accountId', e.target.value)} className={cls}>
                      <option value="">Välj konto…</option>
                      {accounts?.map(a => (
                        <option key={a.id} value={a.id}>{a.id} – {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number" step="0.01" min="0"
                      value={row.debit}
                      onChange={e => updateRow(i, 'debit', e.target.value)}
                      disabled={row.credit !== ''}
                      className={cls}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number" step="0.01" min="0"
                      value={row.credit}
                      onChange={e => updateRow(i, 'credit', e.target.value)}
                      disabled={row.debit !== ''}
                      className={cls}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button" onClick={() => removeRow(i)} disabled={rows.length <= 2}
                      className="rounded p-1.5 text-slate-300 transition-colors hover:text-red-500 disabled:opacity-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Summa</td>
                <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">{totalDebit.toFixed(2)}</td>
                <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">{totalCredit.toFixed(2)}</td>
                <td />
              </tr>
              {Math.abs(diff) > 0.01 && (
                <tr>
                  <td colSpan={4} className="px-4 py-1.5 text-right text-xs text-red-500">
                    Differens: {Math.abs(diff).toFixed(2)} kr
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* Add row + submit */}
        <div className="flex items-center justify-between">
          <button
            type="button" onClick={addRow}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <Plus className="h-4 w-4" /> Lägg till rad
          </button>
          <button
            type="submit"
            disabled={Math.abs(diff) > 0.01 || valid.length < 2 || saving}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Sparar…' : editId ? 'Uppdatera' : 'Bokför'}
          </button>
        </div>

        {error   && <Notice type="error">{error}</Notice>}
        {success && <Notice type="success">{success}</Notice>}
      </form>
    </div>
  );
}

function Notice({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  const c = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-600'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return <p className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</p>;
}
