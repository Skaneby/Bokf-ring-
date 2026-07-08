import React, { useState } from 'react';
import { FolderOpen, Unlink, Loader2, Database, AlertTriangle, MonitorSmartphone } from 'lucide-react';
import { getIdentity, compareDb, DbIdentity } from '../db';
import {
  BokforingsfilMeta, FileInfo, verifyPermission, inspectFile, readFromFile,
  writeToFile, clearBokforingsfil, setBokforingsfil,
} from '../lib/bokforingsfil';

interface Props {
  meta: BokforingsfilMeta; // har alltid handle när denna skärm visas
  onOpened: (name: string) => void;
  onDisconnected: () => void;
}

const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }) : 'okänd tid';

type Conflict =
  | { kind: 'local-newer'; file: FileInfo; local: DbIdentity }
  | { kind: 'different'; file: FileInfo; local: DbIdentity };

// Visas vid start när appen minns en bokföringsfil. Innan databasen öppnas
// jämförs identitet (databas-ID) och revision — så att man aldrig omedvetet
// bokför i fel databas eller tappar ändringar som inte nått filen.
export function OpenBokforing({ meta, onOpened, onDisconnected }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const finishOpen = async (name: string) => {
    await setBokforingsfil({ name, handle: meta.handle });
    onOpened(name);
  };

  const handleOpen = async () => {
    setError('');
    setBusy(true);
    try {
      if (!(await verifyPermission(meta.handle!))) {
        setError('Behörighet till filen nekades. Försök igen, eller koppla från filen nedan.');
        setBusy(false);
        return;
      }

      // Synkkontroll FÖRE inläsning: är det samma databas, och vem är nyast?
      const file = await inspectFile(meta.handle!);
      const local = await getIdentity();
      const verdict = compareDb(local, file);

      if (verdict === 'local-newer') {
        setConflict({ kind: 'local-newer', file, local: local! });
        setBusy(false);
        return;
      }
      if (verdict === 'different' && local) {
        setConflict({ kind: 'different', file, local });
        setBusy(false);
        return;
      }

      // same / no-local / legacy-file → läs in filen
      const { name } = await readFromFile(meta.handle!);
      await finishOpen(name ?? meta.name);
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'NotFoundError'
        ? 'Filen hittades inte — den kan ha flyttats eller raderats. Koppla från och öppna den på nytt från startskärmen.'
        : 'Kunde inte läsa bokföringsfilen. Kontrollera att filen finns kvar och försök igen.');
      setBusy(false);
    }
  };

  // Webbläsaren nyare: användaren väljer version — båda vägarna är säkra
  const useLocal = async () => {
    setBusy(true);
    try {
      await writeToFile(meta.handle!, meta.name); // skriver webbläsarens version till filen
      await finishOpen(meta.name);
    } catch {
      setError('Kunde inte uppdatera filen. Försök igen.');
      setBusy(false);
    }
  };

  const useFile = async () => {
    setBusy(true);
    try {
      const { name } = await readFromFile(meta.handle!);
      await finishOpen(name ?? meta.name);
    } catch {
      setError('Kunde inte läsa filen. Försök igen.');
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    await clearBokforingsfil();
    onDisconnected();
  };

  // ── Konfliktvyer — pedagogiska val istället för tyst fel ─────────────────
  if (conflict?.kind === 'local-newer') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
              <MonitorSmartphone className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Webbläsaren har nyare ändringar</h1>
              <p className="text-sm text-slate-500">{meta.name}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 space-y-2">
            <p>
              Det här är <strong>samma bokföring</strong> (databas-ID:t stämmer), men webbläsarens
              kopia har hunnit längre än filen — troligen sparades inte allt sist, eller så är
              filen en äldre kopia.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-emerald-50 p-2.5">
                <p className="font-semibold text-emerald-800">Webbläsaren (nyast)</p>
                <p className="text-emerald-700">Version {conflict.local.revision}</p>
                <p className="text-emerald-700">{fmtTime(conflict.local.modifiedAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2.5">
                <p className="font-semibold text-slate-700">Filen</p>
                <p className="text-slate-600">Version {conflict.file.revision ?? 0}</p>
                <p className="text-slate-600">{fmtTime(conflict.file.modifiedAt)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={useLocal}
              disabled={busy}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 transition-colors"
            >
              Fortsätt med webbläsarens version <span className="font-normal text-slate-300">— filen uppdateras (rekommenderas)</span>
            </button>
            <button
              onClick={useFile}
              disabled={busy}
              className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60 transition-colors"
            >
              Använd filens version <span className="font-normal text-slate-400">— webbläsarens senare ändringar kastas</span>
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  if (conflict?.kind === 'different') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Det här är en annan bokföring</h1>
              <p className="text-sm text-slate-500">Databas-ID:t i filen matchar inte webbläsarens</p>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-slate-600 space-y-2">
            <p>
              Filen innehåller bokföringen <strong>{conflict.file.name ?? 'utan namn'}</strong>,
              men webbläsaren arbetar just nu med en <strong>annan databas</strong>.
              Om du öppnar filen ersätts webbläsarens kopia helt — inget slås ihop.
            </p>
            <p className="text-xs text-slate-400">
              Fil-ID: {conflict.file.dbId?.slice(0, 8)}… · Webbläsarens ID: {conflict.local.id.slice(0, 8)}…
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={useFile}
              disabled={busy}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 transition-colors"
            >
              Öppna {conflict.file.name ?? 'filens bokföring'} — ersätt webbläsarens kopia
            </button>
            <button
              onClick={() => setConflict(null)}
              className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-white transition-colors"
            >
              Avbryt
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

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
            Appen minns din bokföringsfil och kontrollerar att det är samma databas
            innan den öppnas — webbläsaren kräver en bekräftelse per besök.
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
          {busy ? 'Kontrollerar och öppnar…' : `Öppna ${meta.name}`}
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
