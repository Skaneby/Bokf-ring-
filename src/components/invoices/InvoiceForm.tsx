import React, { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { InvoiceRow, InvoiceMethod, Invoice } from '../../db';
import { formatCurrency } from '../../lib/utils';
import {
  createInvoice, invoiceTotals, getCompanySettings, downloadInvoiceFile,
} from '../../lib/invoice';
import { Plus, Trash2 } from 'lucide-react';

const cls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 ' +
  'focus:border-transparent';

const emptyRow = (): InvoiceRow => ({ description: '', qty: 1, unitPrice: 0, vatRate: 25 });

export function InvoiceForm({ onCreated }: { onCreated: (inv: Invoice) => void }) {
  const [date, setDate]         = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate]   = useState('');
  const [method, setMethod]     = useState<InvoiceMethod>('faktura');
  const [customerName, setCustomerName]       = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerOrgnr, setCustomerOrgnr]     = useState('');
  const [customerEmail, setCustomerEmail]     = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [rows, setRows]   = useState<InvoiceRow[]>([emptyRow()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Förifyll förfallodatum och metod från inställningarna
  useEffect(() => {
    getCompanySettings().then(s => {
      setDueDate(format(addDays(new Date(), s.paymentTermsDays), 'yyyy-MM-dd'));
      setMethod(s.defaultMethod);
    });
  }, []);

  const updateRow = (i: number, patch: Partial<InvoiceRow>) =>
    setRows(r => r.map((row, j) => j === i ? { ...row, ...patch } : row));
  const addRow    = () => setRows(r => [...r, emptyRow()]);
  const removeRow = (i: number) => { if (rows.length > 1) setRows(r => r.filter((_, j) => j !== i)); };

  const validRows = rows.filter(r => r.description.trim() && r.qty > 0 && r.unitPrice > 0);
  const totals = invoiceTotals(validRows);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!customerName.trim()) { setError('Kundnamn krävs.'); return; }
    if (validRows.length === 0) { setError('Minst en fakturarad med beskrivning, antal och pris krävs.'); return; }
    setSaving(true);
    try {
      const inv = await createInvoice({
        date, dueDate, method,
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim() || undefined,
        customerOrgnr: customerOrgnr.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        customerReference: customerReference.trim() || undefined,
        rows: validRows,
      });
      // Spara fakturafilen lokalt på datorn (inställning, på som standard)
      const settings = await getCompanySettings();
      if (settings.autoDownloadInvoice !== false && inv.documentHtml) {
        downloadInvoiceFile(inv, inv.documentHtml);
      }
      onCreated(inv);
    } catch {
      setError('Kunde inte skapa fakturan. Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Kund */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Kund</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-slate-500">Namn *</label>
            <input type="text" required value={customerName} onChange={e => setCustomerName(e.target.value)}
                   placeholder="Kund AB" className={cls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-500">Org.nr</label>
            <input type="text" value={customerOrgnr} onChange={e => setCustomerOrgnr(e.target.value)}
                   placeholder="556000-0000" className={cls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-500">Adress</label>
            <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)}
                      rows={2} placeholder={'Gatan 1\n123 45 Staden'} className={cls + ' resize-none'} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-500">E-post</label>
            <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                   placeholder="faktura@kund.se" className={cls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-500">Er referens</label>
            <input type="text" value={customerReference} onChange={e => setCustomerReference(e.target.value)}
                   placeholder="Kundens kontaktperson" className={cls} />
          </div>
        </div>
      </div>

      {/* Datum & metod */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs text-slate-500">Fakturadatum</label>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-slate-500">Förfallodatum</label>
          <input type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-slate-500">Bokföring</label>
          <select value={method} onChange={e => setMethod(e.target.value as InvoiceMethod)} className={cls}>
            <option value="faktura">Vid skapande (fakturametoden)</option>
            <option value="kontant">Vid betalning (kontantmetoden)</option>
          </select>
        </div>
      </div>

      {/* Rader */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[1fr_5rem_7rem_6rem_2.75rem] border-b border-slate-100 px-4 py-3 gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Beskrivning</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Antal</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">À-pris exkl.</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Moms</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div key={i} className="border-t border-slate-100 first:border-0 p-3 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1fr_5rem_7rem_6rem_2.75rem] sm:items-center sm:gap-2 sm:px-4 sm:py-2">
            <input
              type="text" value={row.description}
              onChange={e => updateRow(i, { description: e.target.value })}
              placeholder="T.ex. Konsultarbete, 10 tim"
              aria-label={`Beskrivning rad ${i + 1}`}
              className={cls}
            />
            <div className="grid grid-cols-3 gap-2 sm:contents">
              <div className="sm:contents">
                <label className="sm:hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5 block">Antal</label>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={row.qty || ''}
                  onChange={e => updateRow(i, { qty: parseFloat(e.target.value) || 0 })}
                  aria-label={`Antal rad ${i + 1}`}
                  className={cls}
                />
              </div>
              <div className="sm:contents">
                <label className="sm:hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5 block">À-pris</label>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={row.unitPrice || ''}
                  onChange={e => updateRow(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                  aria-label={`À-pris rad ${i + 1}`}
                  className={cls}
                />
              </div>
              <div className="sm:contents">
                <label className="sm:hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5 block">Moms</label>
                <select
                  value={row.vatRate}
                  onChange={e => updateRow(i, { vatRate: Number(e.target.value) as InvoiceRow['vatRate'] })}
                  aria-label={`Momssats rad ${i + 1}`}
                  className={cls}
                >
                  <option value={25}>25 %</option>
                  <option value={12}>12 %</option>
                  <option value={6}>6 %</option>
                  <option value={0}>0 %</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end sm:justify-center">
              <button
                type="button" onClick={() => removeRow(i)} disabled={rows.length <= 1}
                aria-label={`Ta bort rad ${i + 1}`}
                className="rounded p-2.5 text-slate-300 transition-colors hover:text-red-500 disabled:opacity-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Summering */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between text-slate-600">
            <span>Netto</span><span className="tabular-nums">{formatCurrency(totals.netTotal)}</span>
          </div>
          {totals.groups.filter(g => g.vat > 0).map(g => (
            <div key={g.rate} className="flex justify-between text-slate-600">
              <span>Moms {g.rate} %</span><span className="tabular-nums">{formatCurrency(g.vat)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-200 pt-1.5">
            <span>Att betala</span><span className="tabular-nums">{formatCurrency(totals.grossTotal)}</span>
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          type="button" onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <Plus className="h-4 w-4" /> Lägg till rad
        </button>
        <button
          type="submit"
          disabled={saving || validRows.length === 0 || !customerName.trim()}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Skapar…' : 'Skapa faktura'}
        </button>
      </div>
      <p className="text-xs text-slate-400">
        {method === 'faktura'
          ? 'Fakturan bokförs direkt: 1510 Kundfordringar mot intäkts- och momskonton. Vid betalning bokförs 1930 mot 1510.'
          : 'Ingenting bokförs nu — intäkt och moms bokförs först när du registrerar fakturan som betald.'}
      </p>
    </form>
  );
}
