import React, { useState } from 'react';
import { db } from '../../db';
import { exportSIE, importSIE, decodeSIEBuffer } from '../../lib/sie';
import { exportBackup, importBackup } from '../../lib/backup';
import { clearBokforingsfil } from '../../lib/bokforingsfil';
import { clearIdentity, wipeBokforing } from '../../db';
import { seedDatabase } from '../../seed';
import { Download, Upload, FlaskConical } from 'lucide-react';

interface Props {
  onReset: () => void;
}

export function BackupTab({ onReset }: Props) {
  const [msg,            setMsg]            = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset,   setConfirmReset]   = useState(false);
  const [confirmSeed,    setConfirmSeed]    = useState(false);
  const [pendingSieFile, setPendingSieFile] = useState<string | null>(null);

  const handleSeed = async () => {
    try {
      const { vouchers } = await seedDatabase();
      notify(true, `Testdata inläst — ${vouchers} exempelverifikationer för räkenskapsåret 2025.`);
    } catch {
      notify(false, 'Kunde inte läsa in testdatan.');
    }
    setConfirmSeed(false);
  };

  const notify = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    if (ok) setTimeout(() => setMsg(null), 5000);
  };

  const handleReset = async () => {
    // Koppla från bokföringsfilen FÖRST — annars auto-sparas tömningen dit
    await clearBokforingsfil();
    await clearIdentity(); // nästa bokföring är en annan databas → nytt ID
    await wipeBokforing(); // rensar även fakturor, deklarationer och företagsuppgifter/mall
    onReset();
  };

  const handleJsonExport = () => exportBackup();

  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { vouchers } = await importBackup(file);
      notify(true, `Backup återställd — ${vouchers} verifikationer importerade.`);
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
    try {
      const content = decodeSIEBuffer(await file.arrayBuffer());
      const hasExisting = (await db.accounts.count()) > 0;
      if (hasExisting) {
        setPendingSieFile(content);
      } else {
        await importSIE(content, 'merge');
        notify(true, 'SIE-fil importerad.');
      }
    } catch {
      notify(false, 'Kunde inte importera SIE-filen.');
    }
    e.target.value = '';
  };

  const doSieImport = async (mode: 'merge' | 'replace') => {
    if (!pendingSieFile) return;
    try {
      await importSIE(pendingSieFile, mode);
      notify(true, 'SIE-fil importerad.');
    } catch {
      notify(false, 'Kunde inte importera SIE-filen.');
    }
    setPendingSieFile(null);
  };

  return (
    <div className="space-y-4">
      {/* SIE import mode modal */}
      {pendingSieFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Importera SIE-fil</h2>
            <p className="mt-2 text-sm text-slate-500">
              Det finns redan bokföring i databasen. Hur vill du importera?
            </p>
            <div className="mt-5 space-y-2">
              <button
                onClick={() => doSieImport('merge')}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <p className="text-sm font-medium text-slate-900">Lägg till</p>
                <p className="text-xs text-slate-500">Behåll befintlig bokföring och lägg till det nya</p>
              </button>
              <button
                onClick={() => doSieImport('replace')}
                className="w-full rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors"
              >
                <p className="text-sm font-medium text-red-700">Ersätt allt</p>
                <p className="text-xs text-red-500">Raderar befintlig bokföring och ersätter med SIE-filens innehåll</p>
              </button>
            </div>
            <button
              onClick={() => setPendingSieFile(null)}
              className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

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
            <input type="file" accept=".se,.si,.sie,.SE,.SI,.SIE" className="hidden" onChange={handleSieImport} />
          </label>
        </div>
      </div>

      {/* Testdata */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <FlaskConical className="h-4 w-4 text-slate-400" /> Testdata
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Fyller appen med en komplett exempelbokföring för räkenskapsåret 2025 (alla momssatser,
            omvänd skattskyldighet, import, fakturor m.m.) — bra för att prova rapporter och
            SRU-export mot Skatteverkets testtjänst. <strong>Ersätter nuvarande bokföring.</strong>
          </p>
        </div>
        {!confirmSeed ? (
          <button
            onClick={() => setConfirmSeed(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <FlaskConical className="h-4 w-4" /> Fyll med testdata
          </button>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-medium text-amber-800">
              Nuvarande bokföring ersätts av exempeldatan. Detta går inte att ångra.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSeed}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              >
                Ja, läs in testdata
              </button>
              <button
                onClick={() => setConfirmSeed(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Byt bokföring */}
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">Byt bokföring</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Starta om med en annan bokföring. All befintlig data raderas permanent.
          </p>
        </div>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
          >
            Ny bokföring / byt företag
          </button>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
            <p className="text-sm font-medium text-red-800">
              All bokföring raderas. Detta går inte att ångra.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Ja, radera allt och starta om
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
