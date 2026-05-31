import React from 'react';
import { Account, Transaction } from '../../db';
import { formatCurrency } from '../../lib/utils';
import { Card, Row, TotalRow, buildBalMap } from './shared';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
}

export function BalansTab({ accounts, transactions }: Props) {
  const bal = buildBalMap(transactions);
  const assets = accounts.filter(a => a.type === 'asset');
  const liab   = accounts.filter(a => a.type === 'liability' || a.type === 'equity');
  let totalA = 0, totalL = 0, netIncome = 0;

  accounts.forEach(a => {
    const b = bal.get(a.id) ?? 0;
    if (a.type === 'revenue') netIncome += -b;
    if (a.type === 'expense') netIncome -= b;
  });

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card title="Tillgångar">
        {assets.filter(a => bal.get(a.id)).map(a => {
          const v = bal.get(a.id) ?? 0; totalA += v;
          return <Row key={a.id} label={`${a.id} ${a.name}`} value={formatCurrency(v)} />;
        })}
        <TotalRow label="Summa tillgångar" value={formatCurrency(totalA)} />
      </Card>

      <Card title="Eget kapital & Skulder">
        {liab.filter(a => bal.get(a.id)).map(a => {
          const v = -(bal.get(a.id) ?? 0); totalL += v;
          return <Row key={a.id} label={`${a.id} ${a.name}`} value={formatCurrency(v)} />;
        })}
        <Row label="Beräknat resultat" value={formatCurrency(netIncome)} subtle />
        <TotalRow label="Summa eget kap. & skulder" value={formatCurrency(totalL + netIncome)} />
      </Card>
    </div>
  );
}
