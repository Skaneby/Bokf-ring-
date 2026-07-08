import React from 'react';
import { Transaction } from '../../db';
import { formatCurrency } from '../../lib/utils';
import { calcMomsLines } from '../../lib/tax';
import { Card } from './shared';

interface Props {
  transactions: Transaction[]; // redan periodfiltrerade av Reports
  periodText: string;
}

// P3 — momsrapport per period: samma rutlogik som momsdeklarationen i
// SkattTab men beräknad på vald period (styrs av rapporternas periodväljare)
export function MomsTab({ transactions, periodText }: Props) {
  const moms = calcMomsLines(transactions);

  const row = (box: string, label: string, value: number, bold = false) => (
    <div className={`flex items-center gap-3 px-5 py-2 ${bold ? 'border-t border-slate-100 bg-slate-50' : ''}`}>
      <span className="w-10 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[11px] font-bold text-slate-500">{box}</span>
      <span className={`min-w-0 flex-1 break-words text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</span>
      <span className={`shrink-0 tabular-nums text-sm ${bold ? 'font-semibold' : ''} ${value < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Momsrapport för <strong>{periodText}</strong> — styr perioden med väljaren ovanför.
        Välj den period som matchar din momsredovisning (månad, kvartal eller helår)
        och för över rutvärdena till momsdeklarationen i Skatteverkets e-tjänst.
      </div>

      <Card title={`Momsdeklarationens rutor — ${periodText}`}>
        {row('05', 'Momspliktig försäljning, netto (3000–3002)', moms.box05)}
        {row('10', 'Utgående moms 25 % (konto 2610)', moms.box10)}
        {row('11', 'Utgående moms 12 % (konto 2620)', moms.box11)}
        {row('12', 'Utgående moms 6 % (konto 2630)', moms.box12)}
        {row('48', 'Ingående moms att dra av (konto 2640)', moms.box48)}
        {row('49', moms.box49 >= 0 ? 'Moms att betala' : 'Moms att återfå', moms.box49, true)}
        <p className="px-5 py-3 text-xs text-slate-400">
          Ruta 20–24 (EU-förvärv och omvänd skattskyldighet) fylls i manuellt i e-tjänsten.
          Beloppen bygger på verifikationsdatum inom perioden.
        </p>
      </Card>
    </div>
  );
}
