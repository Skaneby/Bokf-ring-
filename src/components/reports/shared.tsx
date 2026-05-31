import React from 'react';

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

export function Row({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <span className={`text-sm ${subtle ? 'italic text-slate-400' : 'text-slate-700'}`}>{label}</span>
      <span className={`tabular-nums text-sm ${subtle ? 'text-slate-400' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

export function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      <span className="tabular-nums text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

/** Build a balance map from transactions. */
export function buildBalMap(transactions: { accountId: number; amount: number }[]) {
  const bal = new Map<number, number>();
  transactions.forEach(t => bal.set(t.accountId, (bal.get(t.accountId) ?? 0) + t.amount));
  return bal;
}
