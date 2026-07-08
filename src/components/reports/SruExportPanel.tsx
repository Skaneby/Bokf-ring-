import React, { useState, useEffect } from 'react';
import { Declaration, DeclarationType } from '../../db';
import { NeRow, setSubmissionStep } from '../../lib/declaration';
import { getCompanySettings } from '../../lib/invoice';
import {
  serialize, toIdNumber12, SruError, SruFiles,
  SRU_FILENAME_INFO, SRU_FILENAME_BLANKETTER,
} from '../../lib/sru';
import { buildNeSruPackage, NE_FALTKODER_VERIFIED } from '../../lib/neSru';
import { buildInk2SruPackage } from '../../lib/ink2';
import { FileDown, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';

const APP_VERSION = { name: 'LokalBokforing', version: '2.0' };
const SKV_UPLOAD_URL = 'https://www.skatteverket.se/foretag/inkomstdeklaration/forredovisningsbyraer/tekniskinformationomfiloverforing.4.13948c0e18e810bfa0cca8.html';
const SKV_MINASIDOR_URL = 'https://www.skatteverket.se/privat/sjalvservice/allaetjanster/mobilappenochminasidor.4.5c1163881590be297b51920.html';

function downloadBytes(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename; // exakt filnamn — får aldrig döpas om
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  taxYear: number;
  rows: NeRow[];
  declaration: Declaration | undefined;
  type: DeclarationType;
}

export function SruExportPanel({ taxYear, rows, declaration, type }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState<SruFiles | null>(null);
  const [error, setError] = useState('');

  // Genererade filer gäller bara det år/den blankett de skapades för
  useEffect(() => { setFiles(null); setError(''); }, [taxYear, type]);

  const sub = declaration?.submission ?? {};
  const today = () => new Date().toISOString().slice(0, 10);

  const handleGenerate = async () => {
    setError('');
    try {
      const company = await getCompanySettings();
      if (!company.name.trim()) {
        setError('Företagsnamn saknas — fyll i under Fakturor → Inställningar.');
        return;
      }
      toIdNumber12(company.orgnr); // kastar med tydligt fel vid ogiltigt nummer
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const input = {
        taxYear, rows, company,
        createdAt: {
          date: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
          time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
        },
        program: APP_VERSION,
      };
      const pkg = type === 'NE' ? buildNeSruPackage(input) : buildInk2SruPackage(input);
      setFiles(serialize(pkg));
      await setSubmissionStep(taxYear, 'exportedAt', today(), type);
    } catch (e) {
      setError(e instanceof SruError
        ? e.message
        : 'Kunde inte generera filerna. Kontrollera företagsuppgifterna.');
    }
  };

  const Step = ({ done, n, title, children }: {
    done: boolean; n: number; title: string; children: React.ReactNode;
  }) => (
    <div className="flex gap-3">
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
      }`}>
        {done ? '✓' : n}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? 'text-emerald-700' : 'text-slate-900'}`}>{title}</p>
        <div className="mt-1 text-sm text-slate-500">{children}</div>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Deklarera via fil — SRU-export
      </p>

      {!NE_FALTKODER_VERIFIED && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Fältkoderna är preliminära.</strong> Innan skarp inlämning måste filen
            kontrolleras i Skatteverkets testtjänst för filöverföring — koderna verifieras
            mot aktuell teknisk beskrivning (SKV 269). Använd exporten som teknisk testfil tills dess.
          </span>
        </div>
      )}

      <div className="space-y-4">
        <Step done={!!sub.exportedAt} n={1} title="Generera och ladda ned SRU-filerna">
          {!files ? (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox" checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                Jag förstår att filerna ska kontrolleras i Skatteverkets testtjänst innan
                skarp inlämning, och att signering alltid sker separat på Mina sidor.
              </label>
              <button
                onClick={handleGenerate}
                disabled={!confirmed}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                Generera SRU-filer för {taxYear}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => downloadBytes(SRU_FILENAME_INFO, files.info)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileDown className="h-4 w-4" /> {SRU_FILENAME_INFO} ({files.info.length} B)
                </button>
                <button
                  onClick={() => downloadBytes(SRU_FILENAME_BLANKETTER, files.blanketter)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileDown className="h-4 w-4" /> {SRU_FILENAME_BLANKETTER} ({files.blanketter.length} B)
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Ladda ned båda filerna. <strong>Döp inte om dem</strong> — Skatteverket kräver
                exakt dessa filnamn. Ändrar du deklarationen: generera om.
              </p>
            </div>
          )}
        </Step>

        <Step done={!!sub.uploadedAt} n={2} title="Ladda upp filerna hos Skatteverket">
          <p>
            Logga in i Skatteverkets e-tjänst för filöverföring och ladda upp båda filerna.{' '}
            <a href={SKV_UPLOAD_URL} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-slate-900 underline">
              Till filöverföringen <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          {sub.exportedAt && !sub.uploadedAt && (
            <button
              onClick={() => setSubmissionStep(taxYear, 'uploadedAt', today(), type)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <CheckCircle className="h-4 w-4" /> Markera som uppladdad
            </button>
          )}
          {sub.uploadedAt && <p className="text-xs text-emerald-600">Uppladdad {sub.uploadedAt}</p>}
        </Step>

        <Step done={!!sub.signedAt} n={3} title="Skriv under på Mina sidor">
          <p>
            Deklarationen skrivs <strong>inte</strong> under i filen. Du (eller behörig
            firmatecknare/deklarationsombud) signerar på Mina sidor med BankID.{' '}
            <a href={SKV_MINASIDOR_URL} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 text-slate-900 underline">
              Till Mina sidor <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          {sub.uploadedAt && !sub.signedAt && (
            <button
              onClick={() => setSubmissionStep(taxYear, 'signedAt', today(), type)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <CheckCircle className="h-4 w-4" /> Markera som signerad
            </button>
          )}
          {sub.signedAt && (
            <p className="text-xs font-medium text-emerald-600">
              Signerad {sub.signedAt} — deklarationen är inlämnad ✓
            </p>
          )}
        </Step>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
