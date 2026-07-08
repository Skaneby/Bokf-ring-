import React, { useState } from 'react';
import { FolderOpen, Unlink, Loader2, Database } from 'lucide-react';
import {
  BokforingsfilMeta, verifyPermission, readFromFile,
  clearBokforingsfil, setBokforingsfil,
} from '../lib/bokforingsfil';

interface Props {
  meta: BokforingsfilMeta; // har alltid handle när denna skärm visas
  onOpened: (name: string) => void;
  onDisconnected: () => void;
}

// Visas vid start när appen minns en bokföringsfil: ett klick bekräftar
// filbehörigheten (webbläsarkrav) och läser in databasen.
export function OpenBokforing({ meta, onOpened, onDisconnected }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = async () => {
    setError('');
    setBusy(true);
    try {
      if (!(await verifyPermission(meta.handle!))) {
        setError('Behörighet till filen nekades. Försök igen, eller koppla från filen nedan.');
        setBusy(false);
        return;
      }
      const { name } = await readFromFile(meta.handle!);
      const finalName = name ?? meta.name;
      await setBokforingsfil({ name: finalName, handle: meta.handle });
      onOpened(finalName);
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'NotFoundError'
        ? 'Filen hittades inte — den kan ha flyttats eller raderats. Koppla från och öppna den på nytt från startskärmen.'
        : 'Kunde inte läsa bokföringsfilen. Kontrollera att filen finns kvar och försök igen.');
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    await clearBokforingsfil();
    onDisconnected();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
          <Database className="h-7 w-7 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase mb-1">Bokföringsdatabas</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{meta.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            Appen minns din bokföringsfil. Öppna den för att fortsätta —
            webbläsaren kräver en bekräftelse per besök.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleOpen}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 transition-colors"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          {busy ? 'Öppnar…' : `Öppna ${meta.name}`}
        </button>

        <button
          onClick={handleDisconnect}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Unlink className="h-3 w-3" />
          Koppla från filen och använd webbläsarens kopia
        </button>
      </div>
    </div>
  );
}
