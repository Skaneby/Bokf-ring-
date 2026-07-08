import React, { useRef, useState } from 'react';
import { FolderOpen, Plus, FileCode, FolderInput, LucideIcon, Loader2 } from 'lucide-react';
import { applyBackupData } from '../lib/backup';
import { importSIE, decodeSIEBuffer } from '../lib/sie';
import { initializeDb } from '../db';
import {
  supportsFileSystem, pickNewFile, pickExistingFile, verifyPermission,
  writeToFile, readFromFile, setBokforingsfil,
} from '../lib/bokforingsfil';

interface Props {
  onLoaded: () => void;
  onStartFresh: () => void;
}

function OptionButton({ icon: Icon, title, subtitle, onClick, busy }: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-slate-900 transition-colors group disabled:opacity-60"
    >
      <div className="mt-0.5 rounded-lg bg-slate-100 p-2 group-hover:bg-slate-900 transition-colors">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
              : <Icon className="h-5 w-5 text-slate-600 group-hover:text-white transition-colors" />}
      </div>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}

export function Welcome({ onLoaded, onStartFresh }: Props) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const sieRef  = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('Min bokföring');
  const [busy, setBusy] = useState<string | null>(null);
  const fsOk = supportsFileSystem();

  const cleanName = () => name.trim() || 'Min bokföring';

  // Skapa ny bokföring MED databasfil på vald plats (rekommenderat)
  const handleCreateWithFile = async () => {
    setError('');
    setBusy('fil');
    try {
      const handle = await pickNewFile(cleanName());
      await initializeDb();
      await setBokforingsfil({ name: cleanName(), handle });
      await writeToFile(handle, cleanName());
      onStartFresh();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('Kunde inte skapa bokföringsfilen. Försök igen eller skapa utan fil.');
      }
    } finally {
      setBusy(null);
    }
  };

  // Skapa utan fil — bokföringen lever enbart i webbläsaren
  const handleCreateWithoutFile = async () => {
    await initializeDb();
    await setBokforingsfil({ name: cleanName() });
    onStartFresh();
  };

  // Öppna en befintlig bokföringsfil (skapad här eller på annan enhet)
  const handleOpenFile = async () => {
    setError('');
    setBusy('oppna');
    try {
      const handle = await pickExistingFile();
      if (!(await verifyPermission(handle))) { setBusy(null); return; }
      const { name: fileName } = await readFromFile(handle);
      await setBokforingsfil({ name: fileName ?? handle.name.replace(/\.bokforing\.json$/, ''), handle });
      onLoaded();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('Kunde inte öppna filen. Kontrollera att det är en bokföringsdatabas (.bokforing.json).');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const data = JSON.parse(await file.text());
      await applyBackupData(data);
      await setBokforingsfil({ name: data.bokforingName ?? cleanName() });
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
      const buffer = await file.arrayBuffer();
      const text = decodeSIEBuffer(buffer);
      await importSIE(text, 'replace');
      await setBokforingsfil({ name: cleanName() });
      onLoaded();
    } catch {
      setError('Kunde inte läsa SIE-filen. Kontrollera att filen är ett giltigt SIE4-format.');
    }
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase mb-1">Lokal</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Bokföring</h1>
          <p className="mt-2 text-sm text-slate-500">
            Det finns ingen bokföringsdatabas här ännu — skapa en ny eller öppna en befintlig.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Bokföringens namn */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">Bokföringens namn</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="T.ex. företagets namn"
            aria-label="Bokföringens namn"
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="space-y-3">
          {fsOk && (
            <OptionButton
              icon={Plus}
              title="Skapa ny bokföring med databasfil"
              subtitle="Välj var filen sparas — appen minns den och sparar dit automatiskt"
              onClick={handleCreateWithFile}
              busy={busy === 'fil'}
            />
          )}
          <OptionButton
            icon={Plus}
            title={fsOk ? 'Skapa utan fil' : 'Skapa ny bokföring'}
            subtitle={fsOk
              ? 'Endast i webbläsaren — ta egna backuper regelbundet'
              : 'Sparas i webbläsaren — ta egna backuper regelbundet'}
            onClick={handleCreateWithoutFile}
          />
          {fsOk && (
            <OptionButton
              icon={FolderInput}
              title="Öppna befintlig bokföringsfil"
              subtitle="En .bokforing.json som skapats här eller på en annan enhet"
              onClick={handleOpenFile}
              busy={busy === 'oppna'}
            />
          )}
          <OptionButton
            icon={FolderOpen}
            title="Ladda in JSON-backup"
            subtitle="Återställ bokföring från en tidigare sparad backupfil"
            onClick={() => jsonRef.current?.click()}
          />
          <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={handleJson} />

          <OptionButton
            icon={FileCode}
            title="Importera SIE4-fil"
            subtitle="Starta från en export ur Fortnox, Visma eller annat system"
            onClick={() => sieRef.current?.click()}
          />
          <input ref={sieRef} type="file" accept=".se,.si,.sie,.SE,.SI,.SIE" className="hidden" onChange={handleSie} />
        </div>

        <p className="text-xs text-slate-400 text-center">
          {fsOk
            ? 'Med databasfil överlever bokföringen webbläsarrensning och kan flyttas mellan datorer.'
            : 'Din webbläsare stödjer inte databasfiler — all data sparas i webbläsaren.'}
        </p>
      </div>
    </div>
  );
}
