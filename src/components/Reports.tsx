import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatCurrency } from '../lib/utils';
import { exportSIE, importSIE } from '../lib/sie';
import { exportBackup, importBackup } from '../lib/backup';
import { calcNELines, calcMomsLines, calculateEgenavgifter, EGENAVGIFTER_RATE, AgeBracket } from '../lib/tax';
import { Download, Upload, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

type Tab = 'resultat' | 'balans' | 'huvudbok' | 'skatt' | 'backup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resultat',  label: 'Resultaträkning' },
  { id: 'balans',    label: 'Balansräkning'   },
  { id: 'huvudbok',  label: 'Huvudbok'         },
  { id: 'skatt',     label: 'Skatt & Deklaration' },
  { id: 'backup',    label: 'Säkerhetskopiering' },
];

export function Reports({ onEditVoucher }: { onEditVoucher: (id: number) => void }) {
  const accounts     = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const vouchers     = useLiveQuery(() => db.vouchers.orderBy('date').toArray());

  const [tab, setTab] = useState<Tab>('resultat');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [pendingSieFile, setPendingSieFile] = useState<string | null>(null);
  const [bracket, setBracket] = useState<AgeBracket>('full');
  const [egBooked, setEgBooked] = useState(false);

  const deleteVoucher = async (id: number) => {
    await db.transaction('rw', db.vouchers, db.transactions, async () => {
      await db.transactions.where('voucherId').equals(id).delete();
      await db.vouchers.delete(id);
    });
    setConfirmDelete(null);
  };

  if (!accounts || !transactions || !vouchers) {
    return <div className="text-sm text-slate-400">Laddar…</div>;
  }

  const bal = new Map<number, number>();
  transactions.forEach(t => bal.set(t.accountId, (bal.get(t.accountId) ?? 0) + t.amount));

  const notify = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    if (ok) setTimeout(() => setMsg(null), 5000);
  };

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleJsonExport = () => exportBackup();

  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { vouchers: v } = await importBackup(file);
      notify(true, `Backup återställd — ${v} verifikationer importerade.`);
    } catch {
      notify(false, 'Kunde inte läsa filen. Kontrollera att det är en giltig JSON-backup.');
    }
    e.target.value = '';
  };

  const handleSieExport = async () => {
    const data = await exportSIE();
    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `sie-export-${new Date().toISOString().slice(0, 10)}.se`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSieImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const content = ev.target?.result as string;
      const hasData = (await db.vouchers.count()) > 0;
      if (hasData) {
        setPendingSieFile(content);
      } else {
        try {
          await importSIE(content, 'merge');
          notify(true, 'SIE-fil importerad.');
        } catch {
          notify(false, 'Kunde inte importera SIE-filen.');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const doSieImport = async (mode: 'merge' | 'replace') => {
    if (!pendingSieFile) return;
    try {
      await importSIE(pendingSieFile, mode);
      notify(true, 'SIE-fil importerad.');
    } catch {
      notify(false, 'Kunde inte importera SIE-filen.');
    }
    setPendingSieFile(null);
  };

  // ── Render helpers ────────────────────────────────────────────────────

  const renderResultat = () => {
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
  };

  const renderBalans = () => {
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
  };

  const renderHuvudbok = () => (
    <div className="space-y-4">
      {vouchers.length === 0 && (
        <p className="text-sm text-slate-400">Inga verifikationer ännu.</p>
      )}
      {vouchers.map(v => {
        const vt = transactions.filter(t => t.voucherId === v.id);
        return (
          <div key={v.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Ver {v.id}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-900">
                  {v.date} — {v.description}
                </span>
                <button
                  onClick={() => onEditVoucher(v.id!)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Redigera
                </button>
                {confirmDelete === v.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => deleteVoucher(v.id!)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Bekräfta
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                      Avbryt
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(v.id!)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Ta bort
                  </button>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Konto</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Debet</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {vt.map(t => {
                  const a = accounts.find(a => a.id === t.accountId);
                  return (
                    <tr key={t.id} className="border-t border-slate-50">
                      <td className="px-5 py-2 text-slate-700">{a?.id} {a?.name}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-slate-900">
                        {t.amount > 0 ? t.amount.toFixed(2) : ''}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-slate-900">
                        {t.amount < 0 ? Math.abs(t.amount).toFixed(2) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );

  const renderBackup = () => (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          msg.ok
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-600'
        }`}>
          {msg.text}
        </div>
      )}

      {/* JSON */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">JSON-backup</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Sparar hela bokföringen som en JSON-fil. Rekommenderas som primär säkerhetskopia.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleJsonExport}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            <Download className="h-4 w-4" /> Ladda ned backup
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <Upload className="h-4 w-4" /> Återställ från backup
            <input type="file" accept=".json" className="hidden" onChange={handleJsonImport} />
          </label>
        </div>
      </div>

      {/* SIE */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">SIE4-export</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Standardformat för att flytta data till Fortnox, Visma eller annan redovisningsbyrå.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSieExport}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Exportera SIE4
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <Upload className="h-4 w-4" /> Importera SIE4
            <input type="file" accept=".se,.si" className="hidden" onChange={handleSieImport} />
          </label>
        </div>
      </div>
    </div>
  );

  const renderSkatt = () => {
    const ne   = calcNELines(accounts, transactions);
    const moms = calcMomsLines(transactions);
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
      <div className={`flex items-center justify-between px-5 py-2 ${bold ? 'border-t border-slate-100 bg-slate-50' : ''}`}>
        <span className={`text-sm ${indent ? 'pl-4 text-slate-500' : bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</span>
        <span className={`tabular-nums text-sm ${bold ? 'font-semibold text-slate-900' : value < 0 ? 'text-red-500' : 'text-slate-900'}`}>
          {formatCurrency(value)}
        </span>
      </div>
    );

    const momsRow = (box: string, label: string, value: number, bold = false) => (
      <div className={`flex items-center gap-3 px-5 py-2 ${bold ? 'border-t border-slate-100 bg-slate-50' : ''}`}>
        <span className="w-10 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[11px] font-bold text-slate-500">{box}</span>
        <span className={`flex-1 text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</span>
        <span className={`tabular-nums text-sm ${bold ? 'font-semibold' : ''} ${value < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
          {formatCurrency(value)}
        </span>
      </div>
    );

    return (
      <div className="space-y-5">

        {/* NE-bilagan */}
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

        {/* Egenavgifter */}
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

        {/* Momsdeklaration */}
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
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Rapporter</h1>

      {/* SIE import mode modal */}
      {pendingSieFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Importera SIE-fil</h2>
            <p className="mt-2 text-sm text-slate-500">
              Det finns redan bokföring i databasen. Hur vill du importera?
            </p>
            <div className="mt-5 space-y-2">
              <button
                onClick={() => doSieImport('merge')}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <p className="text-sm font-medium text-slate-900">Lägg till</p>
                <p className="text-xs text-slate-500">Behåll befintlig bokföring och lägg till det nya</p>
              </button>
              <button
                onClick={() => doSieImport('replace')}
                className="w-full rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors"
              >
                <p className="text-sm font-medium text-red-700">Ersätt allt</p>
                <p className="text-xs text-red-500">Raderar befintlig bokföring och ersätter med SIE-filens innehåll</p>
              </button>
            </div>
            <button
              onClick={() => setPendingSieFile(null)}
              className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setMsg(null); }}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
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

      {tab === 'resultat' && renderResultat()}
      {tab === 'balans'   && renderBalans()}
      {tab === 'huvudbok' && renderHuvudbok()}
      {tab === 'skatt'    && renderSkatt()}
      {tab === 'backup'   && renderBackup()}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function Row({ label, value, subtle }: { label: string; value: string; subtle?: boolean; key?: React.Key }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <span className={`text-sm ${subtle ? 'italic text-slate-400' : 'text-slate-700'}`}>{label}</span>
      <span className={`tabular-nums text-sm ${subtle ? 'text-slate-400' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      <span className="tabular-nums text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}
