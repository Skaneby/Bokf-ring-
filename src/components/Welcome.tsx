import React, { useRef } from 'react';
import { BookOpen, FolderOpen, Plus } from 'lucide-react';
import { importBackup } from '../lib/backup';

interface Props {
  onLoaded: () => void;
  onStartFresh: () => void;
}

export function Welcome({ onLoaded, onStartFresh }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importBackup(file);
      onLoaded();
    } catch {
      alert('Kunde inte läsa filen. Kontrollera att det är en giltig JSON-backup.');
    }
  };

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
              <p className="text-sm text-slate-500 mt-0.5">Öppna en JSON-backup från Google Drive eller din enhet</p>
            </div>
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />

          <button
            onClick={onStartFresh}
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
