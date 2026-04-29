import React, { useRef, useState } from 'react';
import { BookOpen, FolderOpen, Plus, FileCode } from 'lucide-react';
import { applyBackupData, buildBackupData } from '../lib/backup';
import { importSIE, decodeSIEBuffer } from '../lib/sie';
import { initializeDb } from '../db';

interface Props {
  onLoaded: () => void;
  onStartFresh: () => void;
}

export function Welcome({ onLoaded, onStartFresh }: Props) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const sieRef  = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const handleJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const data = JSON.parse(await file.text());
      await applyBackupData(data);
      onLoaded();
    } catch {
      setError('Kunde inte läsa filen. Kontrollera att det är en giltig JSON-backup.');
    }
    e.target.value = '';
  };

  const handleSie = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      // SIE4 uses CP437 (PC8) — decode with full CP437→Unicode mapping
      const buffer = await file.arrayBuffer();
      const text = decodeSIEBuffer(buffer);
      await importSIE(text, 'replace');
      onLoaded();
    } catch {
      setError('Kunde inte läsa SIE-filen. Kontrollera att filen är ett giltigt SIE4-format.');
    }
    e.target.value = '';
  };

  const handleFresh = async () => {
    await initializeDb();
    onStartFresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase mb-1">Lokal</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Bokföring</h1>
          <p className="mt-2 text-sm text-slate-500">Välj hur du vill starta</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => jsonRef.current?.click()}
            className="w-full flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-slate-900 transition-colors group"
          >
            <div className="mt-0.5 rounded-lg bg-slate-100 p-2 group-hover:bg-slate-900 transition-colors">
              <FolderOpen className="h-5 w-5 text-slate-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Ladda in JSON-backup</p>
              <p className="text-sm text-slate-500 mt-0.5">Återställ bokföring från en tidigare sparad JSON-fil</p>
            </div>
          </button>
          <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={handleJson} />

          <button
            onClick={() => sieRef.current?.click()}
            className="w-full flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-slate-900 transition-colors group"
          >
            <div className="mt-0.5 rounded-lg bg-slate-100 p-2 group-hover:bg-slate-900 transition-colors">
              <FileCode className="h-5 w-5 text-slate-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Importera SIE4-fil</p>
              <p className="text-sm text-slate-500 mt-0.5">Starta från en export ur Fortnox, Visma eller annat system</p>
            </div>
          </button>
          <input ref={sieRef} type="file" accept=".se,.si,.sie,.SE,.SI,.SIE" className="hidden" onChange={handleSie} />

          <button
            onClick={handleFresh}
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
