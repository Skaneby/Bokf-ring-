import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

export function Dashboard() {
  const accounts     = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());

  if (!accounts || !transactions) {
    return <div className="text-sm text-slate-400">Laddar…</div>;
  }

  const bal = new Map<number, number>();
  transactions.forEach(t => bal.set(t.accountId, (bal.get(t.accountId) ?? 0) + t.amount));

  let assets = 0, liabilities = 0, revenue = 0, expenses = 0;
  accounts.forEach(a => {
    const b = bal.get(a.id) ?? 0;
    if (a.type === 'asset')                               assets      += b;
    if (a.type === 'liability' || a.type === 'equity')    liabilities -= b;
    if (a.type === 'revenue')                             revenue     -= b;
    if (a.type === 'expense')                             expenses    += b;
  });
  const result = revenue - expenses;

  const kpis = [
    { label: 'Tillgångar',           value: assets,      positive: true  },
    { label: 'Skulder & Eget kap.',  value: liabilities, positive: true  },
    { label: 'Intäkter',             value: revenue,     positive: true  },
    { label: 'Kostnader',            value: expenses,    positive: false },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Översikt</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {format(new Date(), "d MMMM yyyy", { locale: sv })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">
              {formatCurrency(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Result */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Årets resultat
        </p>
        <p className={`mt-3 text-4xl font-bold tabular-nums ${result >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {formatCurrency(result)}
        </p>
        <p className="mt-1.5 text-xs text-slate-400">Intäkter minus kostnader</p>
      </div>

      {/* Data summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex gap-8 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Verifikationer</p>
          <p className="mt-1 font-semibold text-slate-900">
            {useLiveQuery(() => db.vouchers.count()) ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Konton</p>
          <p className="mt-1 font-semibold text-slate-900">{accounts.length}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Transaktioner</p>
          <p className="mt-1 font-semibold text-slate-900">{transactions.length}</p>
        </div>
      </div>
    </div>
  );
}
