import React, { useState } from 'react';
import { HardDriveDownload, Loader2, Download, X } from 'lucide-react';
import { exportBackup } from '../lib/backup';
import {
  BokforingsfilMeta, supportsFileSystem, pickNewFile, writeToFile, setBokforingsfil,
} from '../lib/bokforingsfil';

interface Props {
  meta: BokforingsfilMeta | null;   // null eller utan handle = ej kopplad till fil
  onConnected: (meta: BokforingsfilMeta) => void;
}

// Pedagogisk guide som visas i Bokför-fliken när bokföringen INTE är
// kopplad till en databasfil: förklarar varför och erbjuder en direkt
// genväg att skapa filen — den pågående bokföringen behålls och skrivs dit.
export function FilePrompt({ meta, onConnected }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false); // bara för sessionen

  if (meta?.handle || dismissed) return null;
  const fsOk = supportsFileSystem();
  const name = meta?.name ?? 'Min bokföring';

  const handleCreate = async () => {
    setError('');
    setBusy(true);
    try {
      const handle = await pickNewFile(name);
      const next: BokforingsfilMeta = { name, handle };
      await setBokforingsfil(next);
      await writeToFile(handle, name); // hela bokföringen skrivs till filen direkt
      onConnected(next);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('Kunde inte skapa databasfilen. Försök igen.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-amber-100 p-2">
          <HardDriveDownload className="h-5 w-5 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            Innan du bokför: din bokföring har ingen databasfil ännu
          </p>
          <p className="text-sm text-amber-800">
            Allt du bokför sparas just nu <strong>bara i den här webbläsaren</strong> —
            rensas webbläsardatan försvinner bokföringen.
            {fsOk
              ? ' Skapa en databasfil så sparas varje verifikat automatiskt till en fil du väljer, och appen öppnar samma databas nästa gång.'
              : ' Din webbläsare stödjer inte databasfiler — ta därför en backup regelbundet.'}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {fsOk ? (
              <button
                onClick={handleCreate}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />}
                {busy ? 'Skapar…' : `Skapa databasfil för "${name}"`}
              </button>
            ) : (
              <button
                onClick={() => exportBackup()}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                <Download className="h-4 w-4" /> Ladda ned backup nu
              </button>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="rounded-lg px-3 py-2 text-sm text-amber-700 hover:text-amber-900 transition-colors"
            >
              Senare — jag förstår risken
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Stäng påminnelsen"
          className="rounded p-1.5 text-amber-400 hover:text-amber-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
