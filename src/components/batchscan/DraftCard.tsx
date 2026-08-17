import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { splitVat, VAT_OUT, VAT_IN } from '../../lib/vat';
import type { Account } from '../../db';
import type { ScanItem, VoucherDraft } from './types';

interface Props {
  item: ScanItem;
  accounts: Account[];
  onChange: (id: string, patch: Partial<VoucherDraft>) => void;
  onToggle: (id: string) => void;
}

const cls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900';

export function DraftCard({ item, accounts, onChange, onToggle }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { draft } = item;

  const expenseAccounts = accounts.filter(a => a.type === 'expense');
  const revenueAccounts = accounts.filter(a => a.type === 'revenue');
  const relevantAccounts = draft.vatDir === 'out' ? revenueAccounts : expenseAccounts;

  const { net, vat } = draft.vatRate > 0
    ? splitVat(draft.gross, draft.vatRate)
    : { net: draft.gross, vat: 0 };

  const vatOutAccount = VAT_OUT[draft.vatRate];

  // The 3 DB rows for this draft (positive = debit, negative = credit)
  const rows = draft.vatDir === 'out'
    ? [
        { accountId: 1930, amount: draft.gross },
        { accountId: draft.accountId, amount: -net },
        ...(draft.vatRate > 0 ? [{ accountId: vatOutAccount, amount: -vat }] : []),
      ]
    : [
        { accountId: draft.accountId, amount: net },
        ...(draft.vatRate > 0 ? [{ accountId: VAT_IN, amount: vat }] : []),
        { accountId: 1930, amount: -draft.gross },
      ];

  const balance = rows.reduce((s, r) => s + r.amount, 0);
  const balanced = Math.abs(balance) < 0.01;
  const hasData = draft.gross > 0;

  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `Konto ${id}`;

  return (
    <div className={`rounded-xl border bg-white transition-colors ${
      !item.selected ? 'opacity-50 border-slate-200' : item.status === 'error' ? 'border-red-200' : 'border-slate-200'
    }`}>
      {/* Main row */}
      <div className="flex items-start gap-3 p-4">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={item.selected}
          onChange={() => onToggle(item.id)}
          className="mt-1 h-4 w-4 rounded border-slate-300 accent-slate-900 cursor-pointer"
        />

        {/* Thumbnail */}
        <div className="h-16 w-12 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
          <img src={item.previewUrl} alt="Kvitto" className="h-full w-full object-cover" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {item.status === 'error' ? (
            <div className="flex items-center gap-1.5 text-red-600 mb-1">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-xs font-medium">OCR misslyckades — justera manuellt</span>
            </div>
          ) : null}

          {/* Description + date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              value={draft.description}
              onChange={e => onChange(item.id, { description: e.target.value })}
              placeholder="Leverantör / beskrivning"
              className={cls}
            />
            <input
              type="date"
              value={draft.date}
              onChange={e => onChange(item.id, { date: e.target.value })}
              className={cls}
            />
          </div>

          {/* Amount + VAT rate */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Belopp inkl. moms</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={draft.gross || ''}
                onChange={e => onChange(item.id, { gross: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className={cls}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Moms</label>
              <select
                value={draft.vatRate}
                onChange={e => onChange(item.id, { vatRate: Number(e.target.value) as VoucherDraft['vatRate'] })}
                className={cls}
              >
                <option value={25}>25 %</option>
                <option value={12}>12 %</option>
                <option value={6}>6 %</option>
                <option value={0}>0 %</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {draft.vatDir === 'out' ? 'Intäktskonto' : 'Kostnadskonto'}
              </label>
              <select
                value={draft.accountId}
                onChange={e => onChange(item.id, { accountId: Number(e.target.value) })}
                className={cls}
              >
                {relevantAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.id} {a.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Visa rader"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Summary strip */}
      {hasData && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 flex items-center justify-between">
          <div className="flex gap-3 text-xs text-slate-500">
            <span>Netto <span className="tabular-nums font-medium text-slate-700">{formatCurrency(net)}</span></span>
            {vat > 0 && <span>Moms <span className="tabular-nums font-medium text-slate-700">{formatCurrency(vat)}</span></span>}
          </div>
          <div className={`text-xs font-semibold tabular-nums ${balanced ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatCurrency(draft.gross)}
          </div>
        </div>
      )}

      {/* Expanded rows */}
      {expanded && hasData && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Bokföringsrader</p>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{r.accountId} · {accountName(r.accountId)}</span>
              <span className={`tabular-nums font-medium ${r.amount > 0 ? 'text-slate-900' : 'text-slate-500'}`}>
                {r.amount > 0 ? `+${formatCurrency(r.amount)}` : formatCurrency(r.amount)}
              </span>
            </div>
          ))}
          {!balanced && (
            <p className="text-xs text-red-500 mt-1">Obalans: {formatCurrency(balance)} — kontrollera beloppet</p>
          )}
        </div>
      )}
    </div>
  );
}
