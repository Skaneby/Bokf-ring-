import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { VoucherEntry } from './components/VoucherEntry';
import { ChartOfAccounts } from './components/ChartOfAccounts';
import { Reports } from './components/Reports';
import { initializeDb } from './db';
import { exportBackup } from './lib/backup';
import { LayoutDashboard, BookOpen, FileText, List, Download, Menu } from 'lucide-react';

const NAV = [
  { id: 'dashboard', label: 'Översikt',   icon: LayoutDashboard },
  { id: 'voucher',   label: 'Bokför',     icon: BookOpen },
  { id: 'accounts',  label: 'Kontoplan',  icon: List },
  { id: 'reports',   label: 'Rapporter',  icon: FileText },
] as const;

type TabId = typeof NAV[number]['id'];

export default function App() {
  const [tab, setTab]     = useState<TabId>('dashboard');
  const [mobile, setMobile] = useState(false);

  useEffect(() => { initializeDb().catch(console.error); }, []);

  const go = (id: TabId) => { setTab(id); setMobile(false); };

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-slate-900
        transition-transform duration-200
        ${mobile ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
      `}>
        {/* Logo */}
        <div className="px-6 py-6 border-b border-slate-800">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-0.5">Lokal</p>
          <h1 className="text-lg font-bold text-white tracking-tight">Bokföring</h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Quick backup */}
        <div className="px-3 py-4 border-t border-slate-800">
          <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
            Säkerhet
          </p>
          <button
            onClick={() => exportBackup()}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Download className="h-4 w-4 shrink-0" />
            Ladda ned backup
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobile && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMobile(false)}
        />
      )}

      {/* ── Main ──────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white md:hidden">
          <span className="font-bold tracking-tight">Bokföring</span>
          <button onClick={() => setMobile(true)} className="p-1 text-slate-400 hover:text-white">
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-5 md:p-8">
          <div className="mx-auto max-w-5xl">
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'voucher'   && <VoucherEntry />}
            {tab === 'accounts'  && <ChartOfAccounts />}
            {tab === 'reports'   && <Reports />}
          </div>
        </main>
      </div>
    </div>
  );
}
