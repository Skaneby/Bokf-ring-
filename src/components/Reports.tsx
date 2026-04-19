import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatCurrency } from '../lib/utils';
import { exportSIE, importSIE } from '../lib/sie';
import { exportBackup, importBackup } from '../lib/backup';
import { Download, Upload } from 'lucide-react';

type Tab = 'resultat' | 'balans' | 'huvudbok' | 'backup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resultat',  label: 'Resultaträkning' },
  { id: 'balans',    label: 'Balansräkning'   },
  { id: 'huvudbok',  label: 'Huvudbok'         },
  { id: 'backup',    label: 'Säkerhetskopiering' },
];

export function Reports() {
  const accounts     = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const vouchers     = useLiveQuery(() => db.vouchers.orderBy('date').toArray());

  const [tab, setTab] = useState<Tab>('resultat');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
      try {
        await importSIE(ev.target?.result as string);
        notify(true, 'SIE-fil importerad.');
      } catch {
        notify(false, 'Kunde inte importera SIE-filen.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
              <span className="text-sm font-medium text-slate-900">
                {v.date} — {v.description}
              </span>
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Rapporter</h1>

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
