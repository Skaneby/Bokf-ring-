import React, { useState } from 'react';
import { CheckSquare, Square, BookOpen, Loader2 } from 'lucide-react';
import { db } from '../../db';
import type { Account } from '../../db';
import { splitVat, VAT_OUT, VAT_IN } from '../../lib/vat';
import type { ScanItem, VoucherDraft } from './types';
import { DraftCard } from './DraftCard';

interface Props {
  items: ScanItem[];
  accounts: Account[];
  onChange: (id: string, patch: Partial<VoucherDraft>) => void;
  onToggle: (id: string) => void;
  onBooked: (count: number) => void;
}

function buildRows(draft: VoucherDraft) {
  const { net, vat } = draft.vatRate > 0
    ? splitVat(draft.gross, draft.vatRate)
    : { net: draft.gross, vat: 0 };

  return draft.vatDir === 'out'
    ? [
        { accountId: 1930, amount: draft.gross },
        { accountId: draft.accountId, amount: -net },
        ...(draft.vatRate > 0 ? [{ accountId: VAT_OUT[draft.vatRate], amount: -vat }] : []),
      ]
    : [
        { accountId: draft.accountId, amount: net },
        ...(draft.vatRate > 0 ? [{ accountId: VAT_IN, amount: vat }] : []),
        { accountId: 1930, amount: -draft.gross },
      ];
}

export function ReviewList({ items, accounts, onChange, onToggle, onBooked }: Props) {
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  const selected = items.filter(i => i.selected && i.draft.gross > 0);
  const allSelected = items.every(i => i.selected);

  const toggleAll = () => {
    items.forEach(i => { if (i.selected === allSelected) onToggle(i.id); });
  };

  const handleBook = async () => {
    if (selected.length === 0) return;
    setBooking(true);
    setError('');
    try {
      await db.transaction('rw', db.vouchers, db.transactions, db.attachments, async () => {
        for (const item of selected) {
          const voucherId = await db.vouchers.add({
            date: item.draft.date,
            description: item.draft.description || item.draft.date,
            created_at: Date.now(),
          });
          await db.transactions.bulkAdd(
            buildRows(item.draft).map(r => ({ voucherId, accountId: r.accountId, amount: r.amount })),
          );
          // Bifoga originalkvittot som bilaga
          const buf = await item.file.arrayBuffer();
          await db.attachments.add({
            voucherId,
            name: item.file.name || 'kvitto.jpg',
            type: item.file.type || 'image/jpeg',
            size: buf.byteLength,
            data: buf,
            created_at: Date.now(),
          });
        }
      });
      onBooked(selected.length);
    } catch {
      setError('Något gick fel vid bokföringen. Försök igen.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Granska och justera</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {items.length} kvitto{items.length !== 1 ? 'n' : ''} skannade — {selected.length} markerade för bokföring
          </p>
        </div>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          {allSelected ? 'Avmarkera alla' : 'Välj alla'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {items.map(item => (
          <DraftCard
            key={item.id}
            item={item}
            accounts={accounts}
            onChange={onChange}
            onToggle={onToggle}
          />
        ))}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 pt-3 pb-1">
        <button
          onClick={handleBook}
          disabled={booking || selected.length === 0}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {booking
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Bokför…</>
            : <><BookOpen className="h-4 w-4" /> Bokför {selected.length} kvitto{selected.length !== 1 ? 'n' : ''}</>
          }
        </button>
      </div>
    </div>
  );
}
