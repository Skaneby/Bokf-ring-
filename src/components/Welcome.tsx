import React, { useRef, useState } from 'react';
import { BookOpen, FolderOpen, Plus, ArrowLeft } from 'lucide-react';
import { importBackup } from '../lib/backup';
import { db } from '../db';

interface Props {
  onLoaded: () => void;
  onStartFresh: () => void;
}

export function Welcome({ onLoaded, onStartFresh }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'start' | 'company'>('start');
  const [companyName, setCompanyName] = useState('');
  const [orgNumber, setOrgNumber]     = useState('');
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importBackup(file);
      onLoaded();
    } catch {
      setError('Kunde inte läsa filen. Kontrollera att det är en giltig JSON-backup.');
    }
    e.target.value = '';
  };

  const handleStartFresh = async () => {
    const name = companyName.trim();
    if (!name) { setError('Ange ett företagsnamn.'); return; }
    await db.settings.bulkPut([
      { key: 'companyName', value: name },
      { key: 'orgNumber',   value: orgNumber.trim() },
    ]);
    onStartFresh();
  };

  if (step === 'company') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <button
            onClick={() => { setStep('start'); setError(''); }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Tillbaka
          </button>

          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase mb-1">Nytt</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Företagsinfo</h1>
            <p className="mt-2 text-sm text-slate-500">Du kan ändra detta senare under Inställningar</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Företagsnamn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={e => { setCompanyName(e.target.value); setError(''); }}
                placeholder="t.ex. Svensson Konsult AB"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Organisationsnummer <span className="text-slate-400 font-normal">(valfritt)</span>
              </label>
              <input
                type="text"
                value={orgNumber}
                onChange={e => setOrgNumber(e.target.value)}
                placeholder="556000-0000"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleStartFresh}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Starta bokföring
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase mb-1">Lokal</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Bokföring</h1>
          <p className="mt-2 text-sm text-slate-500">Välj hur du vill starta</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-slate-900 transition-colors group"
          >
            <div className="mt-0.5 rounded-lg bg-slate-100 p-2 group-hover:bg-slate-900 transition-colors">
              <FolderOpen className="h-5 w-5 text-slate-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Ladda in befintlig bokföring</p>
              <p className="text-sm text-slate-500 mt-0.5">Öppna en JSON-backup från din enhet</p>
            </div>
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={() => { setError(''); setStep('company'); }}
            className="w-full flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-slate-900 transition-colors group"
          >
            <div className="mt-0.5 rounded-lg bg-slate-100 p-2 group-hover:bg-slate-900 transition-colors">
              <Plus className="h-5 w-5 text-slate-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Starta ny bokföring</p>
              <p className="text-sm text-slate-500 mt-0.5">Börja från scratch med tom databas</p>
            </div>
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center">
          All data sparas lokalt i din webbläsare
        </p>
      </div>
    </div>
  );
}
