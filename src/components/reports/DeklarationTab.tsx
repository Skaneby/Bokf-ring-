import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Voucher, Transaction, DeclarationType } from '../../db';
import { formatCurrency } from '../../lib/utils';
import {
  buildNeRows, taxYearsAvailable, saveAdjustment,
  setDeclarationStatus, renderNePrintHtml, NeRow,
} from '../../lib/declaration';
import { buildInk2Rows } from '../../lib/ink2';
import { getCompanySettings } from '../../lib/invoice';
import { SruExportPanel } from './SruExportPanel';
import { Printer, RotateCcw, Pencil, CheckCircle } from 'lucide-react';

interface Props {
  vouchers: Voucher[];
  transactions: Transaction[];
}

export function DeklarationTab({ vouchers, transactions }: Props) {
  const years = taxYearsAvailable(vouchers);
  const [taxYear, setTaxYear] = useState<number>(years[0] ?? new Date().getFullYear());
  const [decType, setDecType] = useState<DeclarationType>('NE');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editNote, setEditNote] = useState('');

  // Reaktiv deklaration (justeringar + status) för valt år och blankettyp
  const declaration = useLiveQuery(
    () => db.declarations.where('taxYear').equals(taxYear).filter(d => d.type === decType).first(),
    [taxYear, decType],
  );

  // Om valt år försvinner (t.ex. all data för året raderad) — hoppa till senaste
  useEffect(() => {
    if (years.length > 0 && !years.includes(taxYear)) setTaxYear(years[0]);
  }, [years.join(','), taxYear]);

  if (years.length === 0) {
    return <p className="text-sm text-slate-400">Inga verifikationer ännu — det finns inget att deklarera.</p>;
  }

  const rows = decType === 'NE'
    ? buildNeRows(vouchers, transactions, taxYear, declaration?.fields ?? {})
    : buildInk2Rows(vouchers, transactions, taxYear, declaration?.fields ?? {});
  const isKlar = declaration?.status === 'klar';

  // Slutresultat per blankettyp (för summeringskortet)
  const finalPos = decType === 'NE' ? rows.find(r => r.id === 'R47')! : rows.find(r => r.id === 'JR')!;
  const finalNegValue = decType === 'NE'
    ? rows.find(r => r.id === 'R48')!.value
    : Math.max(0, -finalPos.value);
  const finalPosValue = decType === 'NE' ? finalPos.value : Math.max(0, finalPos.value);

  const startEdit = (row: NeRow) => {
    setEditing(row.id);
    setEditValue(String(row.value));
    setEditNote(row.note ?? '');
  };

  const commitEdit = async (lineId: string) => {
    const value = Math.round(parseFloat(editValue));
    if (Number.isNaN(value)) { setEditing(null); return; }
    await saveAdjustment(taxYear, lineId, { value, note: editNote.trim() || undefined }, decType);
    setEditing(null);
  };

  const resetLine = async (lineId: string) => {
    await saveAdjustment(taxYear, lineId, null, decType);
    setEditing(null);
  };

  const handlePrint = async () => {
    const company = await getCompanySettings();
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(renderNePrintHtml(
      taxYear, rows, company.name || 'Företaget',
      decType === 'NE' ? 'NE-bilagan' : 'INK2 (förenklat räkenskapsschema)',
    ));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  return (
    <div className="space-y-4">
      {/* Kontroller */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Beskattningsår</label>
          <select
            value={taxYear}
            onChange={e => setTaxYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Blankett</label>
          <select
            value={decType}
            onChange={e => { setDecType(e.target.value as DeclarationType); setEditing(null); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="NE">NE — enskild firma</option>
            <option value="INK2">INK2 — aktiebolag</option>
          </select>
        </div>
        <span className="flex-1" />
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Printer className="h-4 w-4" /> Skriv ut underlag
        </button>
        <button
          onClick={() => setDeclarationStatus(taxYear, isKlar ? 'draft' : 'klar', decType)}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isKlar
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <CheckCircle className="h-4 w-4" />
          {isKlar ? 'Klar för deklaration ✓' : 'Markera som klar'}
        </button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        {decType === 'NE' ? (
          <>Blankettvyn följer NE-bilagans radnummer (R1–R48) för manuell inmatning i Skatteverkets e-tjänst.
          Kontomappningen är förenklad — kontrollera beloppen, och justera vid behov direkt i tabellen.
          Schablonavdrag för egenavgifter (25&nbsp;%) görs i e-tjänsten.</>
        ) : (
          <>Förenklat räkenskapsschema (INK2R) och skattemässiga justeringar (INK2S) för aktiebolag.
          Posterna är aggregerade kontointervall — inte blankettens officiella postnumrering.
          Kontrollera mot blanketten och justera vid behov direkt i tabellen.</>
        )}
      </div>

      {/* Blankettrader */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden sm:grid sm:grid-cols-[3rem_1fr_10rem_10rem_5.5rem] gap-2 border-b border-slate-100 px-4 py-3">
          {['Rad', 'Benämning', 'Bokfört', 'Deklarerat', ''].map((h, i) => (
            <span key={i} className={`text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${i >= 2 && i <= 3 ? 'text-right' : ''}`}>{h}</span>
          ))}
        </div>

        {rows.map(row => {
          const isComputed = row.kind === 'computed';
          const isEditing = editing === row.id;
          return (
            <div
              key={row.id}
              className={`border-t border-slate-50 px-4 py-2.5 ${
                isComputed ? 'bg-slate-50 font-semibold' : ''
              } ${row.adjusted ? 'bg-amber-50/50' : ''}`}
            >
              <div className="grid grid-cols-[3rem_1fr] sm:grid-cols-[3rem_1fr_10rem_10rem_5.5rem] gap-2 items-center">
                <span className="text-sm font-semibold text-slate-500">{row.id}</span>
                <span className="min-w-0 break-words text-sm text-slate-700">
                  {row.label}
                  {row.adjusted && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Justerad</span>
                  )}
                </span>
                <span className="hidden sm:block text-right tabular-nums text-sm text-slate-400">
                  {isComputed ? '' : formatCurrency(row.auto)}
                </span>

                {isEditing ? (
                  <input
                    type="number" inputMode="decimal" autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(row.id); if (e.key === 'Escape') setEditing(null); }}
                    aria-label={`Deklarerat värde ${row.id}`}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                ) : (
                  <span className={`col-start-2 sm:col-start-4 text-right tabular-nums text-sm ${
                    isComputed && ((row.id === 'R48' && row.value > 0) || row.value < 0)
                      ? 'text-red-600'
                      : 'text-slate-900'
                  }`}>
                    {formatCurrency(row.value)}
                  </span>
                )}

                <span className="col-start-2 sm:col-start-5 flex justify-end gap-1">
                  {!isComputed && !isEditing && (
                    <>
                      <button
                        onClick={() => startEdit(row)}
                        aria-label={`Justera ${row.id}`}
                        className="rounded p-2 text-slate-300 hover:text-slate-700 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {row.adjusted && (
                        <button
                          onClick={() => resetLine(row.id)}
                          aria-label={`Återställ ${row.id} till bokfört värde`}
                          className="rounded p-2 text-amber-500 hover:text-amber-700 transition-colors"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                  {isEditing && (
                    <button
                      onClick={() => commitEdit(row.id)}
                      className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
                    >
                      Spara
                    </button>
                  )}
                </span>
              </div>

              {isEditing && (
                <div className="mt-2 sm:pl-[3.5rem]">
                  <input
                    type="text"
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    placeholder="Anteckning — varför justeras raden? (rekommenderas)"
                    aria-label={`Anteckning för justering av ${row.id}`}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              )}
              {!isEditing && row.note && (
                <p className="mt-1 sm:pl-[3.5rem] text-xs text-amber-700">{row.note}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Resultatsummering */}
      <div className={`flex items-center justify-between rounded-xl border-2 p-5 ${
        finalPosValue > 0 ? 'border-emerald-600 bg-emerald-50' : finalNegValue > 0 ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
      }`}>
        <div>
          <p className="font-bold text-slate-900">
            {finalPosValue > 0
              ? (decType === 'NE' ? 'Överskott av näringsverksamhet' : 'Skattemässigt överskott')
              : finalNegValue > 0
                ? (decType === 'NE' ? 'Underskott av näringsverksamhet' : 'Skattemässigt underskott')
                : 'Nollresultat'}
          </p>
          <p className="text-sm text-slate-500">
            {decType === 'NE'
              ? (finalPosValue > 0 ? 'Förs till INK1 ruta 10.1' : finalNegValue > 0 ? 'Förs till INK1 ruta 10.2' : 'Ingen ruta att fylla i på INK1')
              : 'Förs till INK2 första sidan (skattemässigt resultat)'}
          </p>
        </div>
        <span className={`text-2xl font-bold tabular-nums ${finalNegValue > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {formatCurrency(finalPosValue > 0 ? finalPosValue : finalNegValue)}
        </span>
      </div>

      {/* SRU-export + inlämningsguide */}
      <SruExportPanel taxYear={taxYear} rows={rows} declaration={declaration} type={decType} />
    </div>
  );
}
