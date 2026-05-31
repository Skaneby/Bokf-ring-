import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ResultatTab } from './reports/ResultatTab';
import { BalansTab }   from './reports/BalansTab';
import { HuvudbokTab } from './reports/HuvudbokTab';
import { SkattTab }    from './reports/SkattTab';
import { BackupTab }   from './reports/BackupTab';

type Tab = 'resultat' | 'balans' | 'huvudbok' | 'skatt' | 'backup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resultat',  label: 'Resultaträkning'     },
  { id: 'balans',    label: 'Balansräkning'        },
  { id: 'huvudbok',  label: 'Huvudbok'              },
  { id: 'skatt',     label: 'Skatt & Deklaration'  },
  { id: 'backup',    label: 'Säkerhetskopiering'   },
];

export function Reports({ onEditVoucher, onReset }: { onEditVoucher: (id: number) => void; onReset: () => void }) {
  const accounts     = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const vouchers     = useLiveQuery(() => db.vouchers.orderBy('date').toArray());

  const [tab, setTab] = useState<Tab>('resultat');

  if (!accounts || !transactions || !vouchers) {
    return <div className="text-sm text-slate-400">Laddar…</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Rapporter</h1>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'resultat' && <ResultatTab accounts={accounts} transactions={transactions} />}
      {tab === 'balans'   && <BalansTab   accounts={accounts} transactions={transactions} />}
      {tab === 'huvudbok' && <HuvudbokTab accounts={accounts} transactions={transactions} vouchers={vouchers} onEditVoucher={onEditVoucher} />}
      {tab === 'skatt'    && <SkattTab    accounts={accounts} transactions={transactions} />}
      {tab === 'backup'   && <BackupTab   onReset={onReset} />}
    </div>
  );
}
