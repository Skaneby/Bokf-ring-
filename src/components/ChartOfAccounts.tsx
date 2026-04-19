import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Account } from '../db';
import { Plus, Trash2 } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  asset:     'Tillgång',
  liability: 'Skuld',
  equity:    'Eget kapital',
  revenue:   'Intäkt',
  expense:   'Kostnad',
};

const TYPE_COLORS: Record<string, string> = {
  asset:     'bg-blue-50 text-blue-700',
  liability: 'bg-amber-50 text-amber-700',
  equity:    'bg-violet-50 text-violet-700',
  revenue:   'bg-emerald-50 text-emerald-700',
  expense:   'bg-slate-100 text-slate-600',
};

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent';

export function ChartOfAccounts() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray());
  const [adding, setAdding] = useState(false);
  const [form,   setForm]   = useState<Partial<Account>>({ type: 'expense' });
  const [err,    setErr]    = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id || !form.name || !form.type) return;
    try {
      await db.accounts.add(form as Account);
      setAdding(false);
      setForm({ type: 'expense' });
      setErr('');
    } catch {
      setErr('Kontonumret finns redan.');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Radera kontot?')) await db.accounts.delete(id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Kontoplan</h1>
          <p className="mt-0.5 text-sm text-slate-500">BAS 2026 — {accounts?.length ?? 0} konton</p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          <Plus className="h-4 w-4" /> Nytt konto
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4"
        >
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Kontonr
            </label>
            <input
              type="number"
              required
              value={form.id || ''}
              onChange={e => setForm({ ...form, id: parseInt(e.target.value) })}
              className={input}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Namn
            </label>
            <input
              type="text"
              required
              value={form.name || ''}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Typ
            </label>
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as any })}
              className={input}
            >
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4 flex items-center justify-between border-t border-slate-100 pt-3">
            {err
              ? <p className="text-sm text-red-500">{err}</p>
              : <span />
            }
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAdding(false); setErr(''); }}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Avbryt
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Spara konto
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Konto
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Namn
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Typ
              </th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {accounts?.map(a => (
              <tr key={a.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-700">{a.id}</td>
                <td className="px-4 py-3 text-slate-900">{a.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${TYPE_COLORS[a.type]}`}>
                    {TYPE_LABELS[a.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="rounded p-1 text-slate-300 transition-colors hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
