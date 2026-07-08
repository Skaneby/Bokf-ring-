import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatCurrency } from '../lib/utils';
import {
  parseGeminiJson, validateRows, toDraftRows, buildVoucherLines, bookDraftRows,
  GeminiRow, DraftRow, ResolveSource,
} from '../lib/geminiImport';
import { FileJson, CheckCircle, AlertCircle, Trash2, ChevronRight } from 'lucide-react';

type Phase = 'idle' | 'drafting' | 'done';

const SOURCE_BADGE: Record<ResolveSource, { label: string; cls: string }> = {
  gemini:  { label: 'Gemini',    cls: 'bg-purple-100 text-purple-700' },
  dict:    { label: 'Ordbok',    cls: 'bg-blue-100 text-blue-700'     },
  history: { label: 'Historik',  cls: 'bg-amber-100 text-amber-700'   },
  none:    { label: 'Saknas',    cls: 'bg-red-100 text-red-600'       },
};

export function GeminiImport() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray()) ?? [];

  const [phase,     setPhase]     = useState<Phase>('idle');
  const [raw,       setRaw]       = useState('');
  const [drafts,    setDrafts]    = useState<DraftRow[]>([]);
  const [selected,  setSelected]  = useState<(number | null)[]>([]);
  const [parseErr,  setParseErr]  = useState('');
  const [bookErr,   setBookErr]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [bookedN,   setBookedN]   = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // ── Parse ────────────────────────────────────────────────────────────────

  const handleParse = async () => {
    setParseErr('');
    try {
      const raw_rows  = parseGeminiJson(raw);
      const validated = validateRows(raw_rows);
      const draft     = await toDraftRows(validated);
      setDrafts(draft);
      setSelected(draft.map(d => d.resolvedAccount));
      setPhase('drafting');
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : 'Okänt fel vid parsning.');
    }
  };

  // ── Book ─────────────────────────────────────────────────────────────────

  const handleBook = async () => {
    const approved = drafts
      .map((d, i) => ({ row: d.row, account: selected[i] }))
      .filter((x): x is { row: GeminiRow; account: number } => x.account !== null);
    if (approved.length === 0) return;
    setSaving(true);
    setBookErr('');
    try {
      const n = await bookDraftRows(approved);
      setBookedN(n);
      setPhase('done');
    } catch {
      setBookErr('Kunde inte bokföra verifikationerna. Ingenting sparades — försök igen.');
    } finally {
      setSaving(false);
    }
  };

  // ── Remove a draft row ───────────────────────────────────────────────────

  const removeRow = (i: number) => {
    setDrafts(d => d.filter((_, j) => j !== i));
    setSelected(s => s.filter((_, j) => j !== i));
  };

  // ── Preview lines for a draft row ───────────────────────────────────────

  const previewLines = (d: DraftRow, acc: number | null) => {
    if (!acc) return [];
    try { return buildVoucherLines(d.row, acc); } catch { return []; }
  };

  const allHaveAccount = selected.every(s => s !== null);
  const skipped        = selected.filter(s => s === null).length;

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  if (phase === 'done') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Importera från Gemini</h1>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-3">
          <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="text-lg font-semibold text-emerald-800">
            {bookedN} verifikation{bookedN !== 1 ? 'er' : ''} bokförda!
          </p>
          <button
            onClick={() => { setPhase('idle'); setRaw(''); }}
            className="mt-2 rounded-lg border border-emerald-300 px-5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            Importera fler
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'drafting') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Importera från Gemini</h1>
          <button
            onClick={() => setPhase('idle')}
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            ← Redigera JSON
          </button>
        </div>

        <p className="text-sm text-slate-500">
          Granska och justera kontona nedan. Rader markerade med <span className="font-semibold text-red-600">Saknas</span> kan inte bokföras utan ett konto.
        </p>

        <div className="space-y-3">
          {drafts.map((d, i) => {
            const acc    = selected[i];
            const badge  = SOURCE_BADGE[d.resolveSource];
            const lines  = previewLines(d, acc);

            return (
              <div
                key={i}
                className={`rounded-xl border bg-white overflow-hidden ${acc ? 'border-slate-200' : 'border-red-200'}`}
              >
                {/* Row header — staplas på mobil så kontoväljaren inte klämmer texten */}
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-1">
                      <span className="text-sm font-medium text-slate-900">{d.row.description}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{d.row.date}</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(d.row.amount)}</span>
                      {d.row.vat_rate > 0 && <span>moms {d.row.vat_rate}%</span>}
                      {d.row.category && <span>#{d.row.category}</span>}
                    </div>
                  </div>

                  {/* Account selector */}
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <select
                      value={acc ?? ''}
                      onChange={e => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        setSelected(s => s.map((x, j) => j === i ? v : x));
                      }}
                      aria-label={`Konto för ${d.row.description}`}
                      className={`min-w-0 flex-1 sm:flex-none rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                        acc ? 'border-slate-200' : 'border-red-300 bg-red-50'
                      }`}
                    >
                      <option value="">Välj konto…</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.id} – {a.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeRow(i)}
                      aria-label={`Ta bort ${d.row.description}`}
                      className="rounded p-2.5 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Ledger preview */}
                {lines.length > 0 && (
                  <div className="border-t border-slate-50 bg-slate-50 px-5 py-2">
                    <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      <span>Konto</span><span className="text-right">Debet</span><span className="text-right">Kredit</span>
                    </div>
                    {lines.map((l, j) => {
                      const a = accounts.find(a => a.id === l.accountId);
                      return (
                        <div key={j} className="grid grid-cols-[1fr_5rem_5rem] gap-2 text-xs text-slate-700">
                          <span>{l.accountId} {a?.name ?? ''}</span>
                          <span className="text-right tabular-nums">{l.amount > 0 ? l.amount.toFixed(2) : ''}</span>
                          <span className="text-right tabular-nums">{l.amount < 0 ? Math.abs(l.amount).toFixed(2) : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {bookErr && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {bookErr}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-500">
            {drafts.length} rad{drafts.length !== 1 ? 'er' : ''}
            {skipped > 0 && <span className="text-red-500"> · {skipped} saknar konto och hoppas över</span>}
          </p>
          <button
            onClick={handleBook}
            disabled={saving || drafts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Bokför…' : `Godkänn och bokför ${allHaveAccount ? drafts.length : drafts.length - skipped} st`}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Idle ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileJson className="h-7 w-7 text-slate-400" />
        <h1 className="text-2xl font-semibold text-slate-900">Importera från Gemini</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-1">Klistra in JSON från din Gemini Gem</p>
          <p className="text-xs text-slate-400 mb-3">
            Accepterar ren JSON eller ett <code className="bg-slate-100 px-1 rounded">```json … ```</code>-block.
            Varje objekt behöver: <code className="bg-slate-100 px-1 rounded">date, description, amount, vat_rate</code>.
          </p>
          <textarea
            ref={textRef}
            value={raw}
            onChange={e => { setRaw(e.target.value); setParseErr(''); }}
            placeholder={`[\n  {\n    "date": "2026-05-15",\n    "description": "Kontorsmaterial",\n    "amount": 250,\n    "vat_rate": 25,\n    "category": "kontorsmaterial",\n    "suggested_account": 6110\n  }\n]`}
            rows={14}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-800 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-y"
          />
        </div>

        {parseErr && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {parseErr}
          </div>
        )}

        <button
          onClick={handleParse}
          disabled={!raw.trim()}
          className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
        >
          Importera och analysera
        </button>
      </div>

      {/* Format reference */}
      <details className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          JSON-format — fältbeskrivning
        </summary>
        <div className="px-5 pb-5 pt-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2 text-left font-semibold text-slate-500">Fält</th>
                <th className="py-2 text-left font-semibold text-slate-500">Typ</th>
                <th className="py-2 text-left font-semibold text-slate-500">Krav</th>
                <th className="py-2 text-left font-semibold text-slate-500">Exempel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                ['date',              'string',  'Obligatorisk', '"2026-05-15"'],
                ['description',       'string',  'Obligatorisk', '"Kontorsmaterial"'],
                ['amount',            'number',  'Obligatorisk', '250   (inkl. moms)'],
                ['vat_rate',          '0|6|12|25','Obligatorisk','25'],
                ['category',          'string',  'Valfri',       '"kontorsmaterial"'],
                ['suggested_account', 'number',  'Valfri',       '6110'],
                ['type',              '"expense"|"revenue"','Valfri','(default: "expense")'],
              ].map(([f, t, r, ex]) => (
                <tr key={f}>
                  <td className="py-1.5 font-mono text-slate-800">{f}</td>
                  <td className="py-1.5 text-slate-500">{t}</td>
                  <td className="py-1.5 text-slate-500">{r}</td>
                  <td className="py-1.5 font-mono text-slate-500">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
