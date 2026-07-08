import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Dashboard } from './components/Dashboard';
import { VoucherEntry } from './components/VoucherEntry';
import { initializeDb, clearIdentity, db, DbIdentity } from './db';
import { exportBackup } from './lib/backup';
import { isOnboardingDone, markOnboardingDone } from './lib/ai';
import {
  BokforingsfilMeta, SaveStatus, getBokforingsfil, clearBokforingsfil,
  createAutoSaver, watchDatabase, writeToFile, AutoSaver,
} from './lib/bokforingsfil';
import { Welcome } from './components/Welcome';
import { OpenBokforing } from './components/OpenBokforing';
import { FilePrompt } from './components/FilePrompt';
import {
  LayoutDashboard, BookOpen, FileText, List, Download, Menu, Link, FileJson, RefreshCw, Receipt,
  Sparkles, HelpCircle,
} from 'lucide-react';

// Lazy-laddade flikar — hålls utanför startbundeln
const ChartOfAccounts = lazy(() => import('./components/ChartOfAccounts').then(m => ({ default: m.ChartOfAccounts })));
const Reports         = lazy(() => import('./components/Reports').then(m => ({ default: m.Reports })));
const GeminiImport    = lazy(() => import('./components/GeminiImport').then(m => ({ default: m.GeminiImport })));
const Invoices        = lazy(() => import('./components/Invoices').then(m => ({ default: m.Invoices })));
const AiChat          = lazy(() => import('./components/AiChat').then(m => ({ default: m.AiChat })));
const Onboarding      = lazy(() => import('./components/Onboarding').then(m => ({ default: m.Onboarding })));

const APP_URL = 'https://skaneby.github.io/Bokf-ring-/';

const NAV = [
  { id: 'dashboard', label: 'Översikt',   icon: LayoutDashboard },
  { id: 'voucher',   label: 'Bokför',     icon: BookOpen },
  { id: 'invoices',  label: 'Fakturor',   icon: Receipt },
  { id: 'accounts',  label: 'Kontoplan',  icon: List },
  { id: 'reports',   label: 'Rapporter',  icon: FileText },
  { id: 'import',    label: 'Importera',  icon: FileJson },
  { id: 'ai',        label: 'AI-hjälp',   icon: Sparkles },
] as const;

type TabId = typeof NAV[number]['id'];

const Loading = () => <div className="text-sm text-slate-400">Laddar…</div>;

export default function App() {
  const [tab, setTab]       = useState<TabId>('dashboard');
  const [mobile, setMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [ready,   setReady]   = useState(false);
  const [hasData, setHasData] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // Bokföringsdatabasen (fil): meta + öppningsläge + sparstatus
  const [filMeta, setFilMeta] = useState<BokforingsfilMeta | null>(null);
  const [filOpened, setFilOpened] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saver, setSaver] = useState<AutoSaver | null>(null);
  const [dbRevision, setDbRevision] = useState<number | null>(null);

  useEffect(() => {
    initializeDb()
      .then(async ({ hasData }) => {
        setFilMeta(await getBokforingsfil());
        setHasData(hasData);
        setReady(true);
      })
      .catch(err => { console.error(err); setReady(true); });
  }, []);

  // Auto-sparning till bokföringsfilen när den är öppnad
  useEffect(() => {
    if (!filMeta?.handle || !filOpened) return;
    const s = createAutoSaver(async () => {
      // Läs meta vid varje sparning — "Byt bokföring" kopplar från filen
      // och då får INGET skrivas (annars skrivs en tom databas till filen)
      const current = await getBokforingsfil();
      if (!current?.handle) return;
      await writeToFile(current.handle, current.name);
      const identity = (await db.settings.get('dbIdentity'))?.value as DbIdentity | undefined;
      setDbRevision(identity?.revision ?? null);
    });
    watchDatabase(s);
    const unsub = s.subscribe(setSaveStatus);
    setSaver(s);
    const flushOnHide = () => { if (document.visibilityState === 'hidden') s.flush(); };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => { unsub(); document.removeEventListener('visibilitychange', flushOnHide); };
  }, [filMeta?.handle, filOpened]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(id);
  }, [copied]);

  // Visa guiden automatiskt första gången appen används med data
  useEffect(() => {
    if (!ready || !hasData) return;
    isOnboardingDone().then(done => { if (!done) setShowGuide(true); });
  }, [ready, hasData]);

  if (!ready) return null;

  // Appen minns en bokföringsfil → be om ett klick för att öppna den
  if (filMeta?.handle && !filOpened) {
    return (
      <OpenBokforing
        meta={filMeta}
        onOpened={async name => {
          setFilMeta({ name, handle: filMeta.handle });
          setFilOpened(true);
          setHasData(true);
        }}
        onDisconnected={async () => {
          setFilMeta(await getBokforingsfil());
          setFilOpened(false);
        }}
      />
    );
  }

  if (!hasData) return (
    <Welcome
      onLoaded={async () => { setFilMeta(await getBokforingsfil()); setFilOpened(true); setHasData(true); }}
      onStartFresh={async () => { setFilMeta(await getBokforingsfil()); setFilOpened(true); setHasData(true); }}
    />
  );

  const editVoucher = (id: number) => { setEditId(id); setTab('voucher'); setMobile(false); };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
    } catch {
      prompt('Kopiera länken:', APP_URL);
    }
    setCopied(true);
  };

  const handleSwitchBooks = async () => {
    // Koppla från filen FÖRST — annars auto-sparas den tömda databasen dit
    saver?.suspend();
    await clearBokforingsfil();
    await clearIdentity(); // nästa bokföring är en ANNAN databas → nytt ID
    setFilMeta(null);
    setFilOpened(false);
    await db.transaction('rw', db.transactions, db.vouchers, db.accounts, db.attachments, async () => {
      await db.transactions.clear();
      await db.vouchers.clear();
      await db.accounts.clear();
      await db.attachments.clear();
    });
    setConfirmSwitch(false);
    setMobile(false);
    setHasData(false);
  };

  const go = (id: TabId) => { setTab(id); setMobile(false); };

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-slate-900
        pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]
        transition-transform duration-200
        ${mobile ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
      `}>
        {/* Logo + aktiv bokföring */}
        <div className="px-6 py-6 border-b border-slate-800">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-0.5">Lokal</p>
          <h1 className="text-lg font-bold text-white tracking-tight">Bokföring</h1>
          {filMeta && (
            <div className="mt-2 min-w-0">
              <p className="truncate text-xs font-medium text-slate-300" title={filMeta.name}>{filMeta.name}</p>
              {filMeta.handle ? (
                <button
                  onClick={() => saver?.flush()}
                  className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                  title="Klicka för att spara nu"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    saveStatus === 'saving' ? 'animate-pulse bg-amber-400'
                    : saveStatus === 'error' ? 'bg-red-500'
                    : 'bg-emerald-500'
                  }`} />
                  {saveStatus === 'saving' ? 'Sparar till fil…'
                   : saveStatus === 'error' ? 'Sparfel — klicka för nytt försök'
                   : `Synkad med fil${dbRevision !== null ? ` · v${dbRevision}` : ''}`}
                </button>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">Endast i webbläsaren — ta backup!</p>
              )}
            </div>
          )}
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
        <div className="px-3 py-4 border-t border-slate-800 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
            Säkerhet
          </p>
          <button
            onClick={() => { setShowGuide(true); setMobile(false); }}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            Visa guiden
          </button>
          <button
            onClick={() => exportBackup()}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Download className="h-4 w-4 shrink-0" />
            Ladda ned backup
          </button>
          <button
            onClick={handleShare}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              copied
                ? 'bg-emerald-900/40 text-emerald-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Link className="h-4 w-4 shrink-0" />
            {copied ? 'Länk kopierad!' : 'Dela appen'}
          </button>
          {confirmSwitch ? (
            <div className="mt-1 rounded-lg bg-red-900/30 p-3 space-y-2">
              <p className="text-xs text-red-300">All data raderas. Säkert?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleSwitchBooks}
                  className="flex-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Ja, radera
                </button>
                <button
                  onClick={() => setConfirmSwitch(false)}
                  className="flex-1 rounded-md bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Avbryt
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmSwitch(true)}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-900/40 hover:text-red-400 transition-colors"
            >
              <RefreshCw className="h-4 w-4 shrink-0" />
              Byt bokföring
            </button>
          )}
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
        <header className="flex items-center justify-between bg-slate-900 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white md:hidden">
          <span className="font-bold tracking-tight">Bokföring</span>
          <button
            onClick={() => setMobile(true)}
            aria-label="Öppna meny"
            className="p-2 text-slate-400 hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-5 md:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-5xl">
            <Suspense fallback={<Loading />}>
              {tab === 'dashboard' && <Dashboard />}
              {/* VoucherEntry hålls monterad — halvskrivna verifikationer
                  överlever flikbyten (göms med CSS istället för unmount) */}
              <div className={tab === 'voucher' ? '' : 'hidden'}>
                {/* Guide: bokföring utan databasfil → erbjud att skapa en innan man bokför */}
                <FilePrompt
                  meta={filMeta}
                  onConnected={m => { setFilMeta(m); setFilOpened(true); }}
                />
                <VoucherEntry editId={editId} onEditDone={() => { setEditId(null); if (editId) setTab('reports'); }} />
              </div>
              {tab === 'invoices'  && <Invoices />}
              {tab === 'accounts'  && <ChartOfAccounts />}
              {tab === 'reports'   && <Reports onEditVoucher={editVoucher} onReset={() => setHasData(false)} />}
              {tab === 'import'    && <GeminiImport />}
              {tab === 'ai'        && <AiChat />}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Onboarding-guide */}
      {showGuide && (
        <Suspense fallback={null}>
          <Onboarding onClose={() => { setShowGuide(false); markOnboardingDone(); }} />
        </Suspense>
      )}
    </div>
  );
}
