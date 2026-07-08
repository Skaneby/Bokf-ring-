import React, { useState } from 'react';
import { Account, Transaction, db } from '../../db';
import { formatCurrency } from '../../lib/utils';
import { calcNELines, calcMomsLines, calculateEgenavgifter, EGENAVGIFTER_RATE, AgeBracket } from '../../lib/tax';
import { format } from 'date-fns';
import { Card } from './shared';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
}

export function SkattTab({ accounts: _accounts, transactions }: Props) {
  const [bracket, setBracket] = useState<AgeBracket>('full');
  const [egBooked, setEgBooked] = useState(false);

  const ne    = calcNELines(transactions);
  const moms  = calcMomsLines(transactions);
  const egavg = calculateEgenavgifter(Math.max(0, ne.aretsResultat), bracket);

  const bookEgenavgifter = async () => {
    if (egavg <= 0) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    await db.transaction('rw', db.vouchers, db.transactions, async () => {
      const vid = await db.vouchers.add({ date: today, description: 'Avsättning beräknade egenavgifter', created_at: Date.now() });
      await db.transactions.bulkAdd([
        { voucherId: vid, accountId: 8422, amount:  egavg },
        { voucherId: vid, accountId: 2514, amount: -egavg },
      ]);
    });
    setEgBooked(true);
    setTimeout(() => setEgBooked(false), 4000);
  };

  const neRow = (label: string, value: number, bold = false, indent = false) => (
    <div className={`flex items-center justify-between gap-3 px-5 py-2 ${bold ? 'border-t border-slate-100 bg-slate-50' : ''}`}>
      <span className={`min-w-0 break-words text-sm ${indent ? 'pl-4 text-slate-500' : bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</span>
      <span className={`shrink-0 tabular-nums text-sm ${bold ? 'font-semibold text-slate-900' : value < 0 ? 'text-red-500' : 'text-slate-900'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );

  const momsRow = (box: string, label: string, value: number, bold = false) => (
    <div className={`flex items-center gap-3 px-5 py-2 ${bold ? 'border-t border-slate-100 bg-slate-50' : ''}`}>
      <span className="w-10 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[11px] font-bold text-slate-500">{box}</span>
      <span className={`min-w-0 flex-1 break-words text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</span>
      <span className={`shrink-0 tabular-nums text-sm ${bold ? 'font-semibold' : ''} ${value < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card title="NE-bilagan (SKV 2161) — automatisk sammanställning">
        {neRow('R1  Nettoomsättning (3000–3799)', ne.nettoomsattning, false, true)}
        {neRow('R2  Övriga intäkter (3800–3999)', ne.ovrigaIntakter, false, true)}
        {neRow('R9  Summa intäkter', ne.summaIntakter, true)}
        {neRow('R10 Varor och material (4000–4899)', -ne.handelvaror, false, true)}
        {neRow('R11 Övriga externa kostnader (5000–6999)', -ne.ovrigaExterna, false, true)}
        {neRow('R12 Personalkostnader (7000–7699)', -ne.personalkostnader, false, true)}
        {neRow('R13 Avskrivningar (7800–7899)', -ne.avskrivningar, false, true)}
        {neRow('R14 Övriga rörelsekostnader (7900–7999)', -ne.ovrigaRorelse, false, true)}
        {neRow('R17 Summa kostnader', -ne.summaKostnader, true)}
        {neRow('R18 Rörelseresultat', ne.rorelseresultat, true)}
        {neRow('R19 Finansiella intäkter (8000–8399)', ne.finansiellaIntakter, false, true)}
        {neRow('R20 Finansiella kostnader inkl. egenavgifter (8400–8799)', -ne.finansiellaKostnader, false, true)}
        <div className={`flex items-center justify-between px-5 py-3 border-t-2 border-slate-900 ${ne.aretsResultat >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <span className="font-bold text-slate-900">
            {ne.aretsResultat >= 0 ? 'R47 Överskott → INK1 ruta 10.1' : 'R48 Underskott → INK1 ruta 10.2'}
          </span>
          <span className={`text-lg font-bold tabular-nums ${ne.aretsResultat >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(ne.aretsResultat))}
          </span>
        </div>
        <p className="px-5 py-3 text-xs text-slate-400">
          Obs: R13 (ej avdragsgilla kostnader), R33 (periodiseringsfond) och R43 (schablonavdrag egenavgifter 25%) kräver manuell justering i Skatteverkets e-tjänst.
        </p>
      </Card>

      <Card title="Egenavgifter — beräkning &amp; avsättning">
        <div className="px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Åldersgrupp</label>
              <select
                value={bracket}
                onChange={e => setBracket(e.target.value as AgeBracket)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="full">26–65 år ({(EGENAVGIFTER_RATE.full * 100).toFixed(2)} %)</option>
                <option value="young">Under 26 år ({(EGENAVGIFTER_RATE.young * 100).toFixed(2)} %)</option>
                <option value="senior">66+ år ({(EGENAVGIFTER_RATE.senior * 100).toFixed(2)} %)</option>
              </select>
            </div>
            <div className="text-sm text-slate-500">
              Underlag (bokfört överskott): <span className="font-semibold text-slate-900">{formatCurrency(Math.max(0, ne.aretsResultat))}</span>
            </div>
          </div>
          <div className="rounded-xl border-2 border-slate-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Beräknade egenavgifter att avsätta</p>
              <p className="text-xs text-slate-400 mt-0.5">Debet 8422 / Kredit 2514</p>
            </div>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{formatCurrency(egavg)}</span>
          </div>
          {egavg > 0 && (
            <button
              onClick={bookEgenavgifter}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              {egBooked ? 'Bokfört! ✓' : 'Bokför avsättning som verifikation'}
            </button>
          )}
          {ne.aretsResultat <= 0 && (
            <p className="text-sm text-slate-400">Ingen avsättning behövs vid underskott.</p>
          )}
        </div>
      </Card>

      <Card title="Momsdeklaration — rut-sammanställning">
        {momsRow('05', 'Momspliktig försäljning, netto (3000–3002)', moms.box05)}
        {momsRow('10', 'Utgående moms 25 % (konto 2610)', moms.box10)}
        {momsRow('11', 'Utgående moms 12 % (konto 2620)', moms.box11)}
        {momsRow('12', 'Utgående moms 6 % (konto 2630)', moms.box12)}
        {momsRow('48', 'Ingående moms att dra av (konto 2640)', moms.box48)}
        {momsRow('49', moms.box49 >= 0 ? 'Moms att betala' : 'Moms att återfå', moms.box49, true)}
        <p className="px-5 py-3 text-xs text-slate-400">
          Ruta 20–24 (EU-förvärv och omvänd skattskyldighet) fylls i manuellt i Skatteverkets e-tjänst.
        </p>
      </Card>
    </div>
  );
}
