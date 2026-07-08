import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Period, periodLabel, splitByPeriod } from '../lib/period';
import { taxYearsAvailable } from '../lib/declaration';
import { ResultatTab }    from './reports/ResultatTab';
import { BalansTab }      from './reports/BalansTab';
import { HuvudbokTab }    from './reports/HuvudbokTab';
import { MomsTab }        from './reports/MomsTab';
import { SkattTab }       from './reports/SkattTab';
import { DeklarationTab } from './reports/DeklarationTab';
import { BackupTab }      from './reports/BackupTab';

type Tab = 'resultat' | 'balans' | 'huvudbok' | 'moms' | 'skatt' | 'deklaration' | 'backup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resultat',    label: 'Resultaträkning'    },
  { id: 'balans',      label: 'Balansräkning'       },
  { id: 'huvudbok',    label: 'Huvudbok'             },
  { id: 'moms',        label: 'Moms (period)'        },
  { id: 'skatt',       label: 'Skatt & Deklaration' },
  { id: 'deklaration', label: 'Deklaration (NE)'    },
  { id: 'backup',      label: 'Säkerhetskopiering'  },
];

// Flikar som styrs av periodväljaren (Skatt/Deklaration har egna årsval)
const PERIOD_TABS: Tab[] = ['resultat', 'balans', 'huvudbok', 'moms'];

export function Reports({ onEditVoucher, onReset }: { onEditVoucher: (id: number) => void; onReset: () => void }) {
  const accounts     = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const vouchers     = useLiveQuery(() => db.vouchers.orderBy('date').toArray());

  const [tab, setTab] = useState<Tab>('resultat');
  const [periodYear, setPeriodYear] = useState<number | 'alla'>('alla');
  const [periodPart, setPeriodPart] = useState<string>('helår'); // 'helår' | 'q1'..'q4' | 'm1'..'m12'

  if (!accounts || !transactions || !vouchers) {
    return <div className="text-sm text-slate-400">Laddar…</div>;
  }

  const years = taxYearsAvailable(vouchers);

  // Bygg periodobjektet från väljarna
  const period: Period | null = periodYear === 'alla' ? null : {
    year: periodYear,
    ...(periodPart.startsWith('q') ? { quarter: Number(periodPart.slice(1)) as 1 | 2 | 3 | 4 } : {}),
    ...(periodPart.startsWith('m') ? { month: Number(periodPart.slice(1)) } : {}),
  };

  // Resultat/huvudbok/moms: periodens transaktioner. Balans: ackumulerat t.o.m. periodslut.
  const split = splitByPeriod(vouchers, transactions, period);
  const vouchersInPeriod = vouchers.filter(v => split.voucherIdsInPeriod.has(v.id!));

  const showPeriodPicker = PERIOD_TABS.includes(tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Rapporter</h1>

        {/* Periodväljare (P2) */}
        {showPeriodPicker && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">År</label>
              <select
                value={periodYear}
                onChange={e => setPeriodYear(e.target.value === 'alla' ? 'alla' : Number(e.target.value))}
                aria-label="Rapportår"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="alla">Alla år</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Period</label>
              <select
                value={periodPart}
                onChange={e => setPeriodPart(e.target.value)}
                disabled={periodYear === 'alla'}
                aria-label="Rapportperiod"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="helår">Helår</option>
                <option value="q1">Kvartal 1</option>
                <option value="q2">Kvartal 2</option>
                <option value="q3">Kvartal 3</option>
                <option value="q4">Kvartal 4</option>
                {['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
                  .map((name, i) => <option key={name} value={`m${i + 1}`}>{name}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

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

      {showPeriodPicker && period && (
        <p className="text-sm text-slate-500">
          Visar <span className="font-medium text-slate-900">{periodLabel(period)}</span>
          {tab === 'balans' && ' — ställning per periodens slut'}
        </p>
      )}

      {tab === 'resultat'    && <ResultatTab accounts={accounts} transactions={split.inPeriod} />}
      {tab === 'balans'      && <BalansTab   accounts={accounts} transactions={split.throughEnd} />}
      {tab === 'huvudbok'    && <HuvudbokTab accounts={accounts} transactions={split.inPeriod} vouchers={vouchersInPeriod} onEditVoucher={onEditVoucher} />}
      {tab === 'moms'        && <MomsTab     transactions={split.inPeriod} periodText={periodLabel(period)} />}
      {tab === 'skatt'       && <SkattTab    accounts={accounts} transactions={transactions} vouchers={vouchers} />}
      {tab === 'deklaration' && <DeklarationTab vouchers={vouchers} transactions={transactions} />}
      {tab === 'backup'      && <BackupTab   onReset={onReset} />}
    </div>
  );
}
