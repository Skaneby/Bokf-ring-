import React from 'react';
import { Account, Transaction } from '../../db';
import { formatCurrency } from '../../lib/utils';
import { Card, Row, TotalRow, buildBalMap } from './shared';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
}

export function ResultatTab({ accounts, transactions }: Props) {
  const bal = buildBalMap(transactions);
  const revenues = accounts.filter(a => a.type === 'revenue');
  const expenses = accounts.filter(a => a.type === 'expense');
  let totalRev = 0, totalExp = 0;

  return (
    <div className="space-y-5">
      <Card title="Intäkter">
        {revenues.filter(a => bal.get(a.id)).map(a => {
          const v = -(bal.get(a.id) ?? 0); totalRev += v;
          return <Row key={a.id} label={`${a.id} ${a.name}`} value={formatCurrency(v)} />;
        })}
        <TotalRow label="Summa intäkter" value={formatCurrency(totalRev)} />
      </Card>

      <Card title="Kostnader">
        {expenses.filter(a => bal.get(a.id)).map(a => {
          const v = bal.get(a.id) ?? 0; totalExp += v;
          return <Row key={a.id} label={`${a.id} ${a.name}`} value={formatCurrency(v)} />;
        })}
        <TotalRow label="Summa kostnader" value={formatCurrency(totalExp)} />
      </Card>

      <div className="flex items-baseline justify-between rounded-xl border-2 border-slate-900 bg-white p-5">
        <span className="font-semibold text-slate-900">Årets resultat</span>
        <span className={`text-2xl font-bold tabular-nums ${totalRev - totalExp >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {formatCurrency(totalRev - totalExp)}
        </span>
      </div>
    </div>
  );
}
