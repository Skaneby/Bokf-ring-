import React, { useState, useEffect } from 'react';
import { Account, Transaction, Voucher, db } from '../../db';
import { Pencil, Trash2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { matchesSearch } from './shared';

const PAGE_SIZE = 25;

const inputCls =
  'w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 ' +
  'focus:border-transparent';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  vouchers: Voucher[];
  onEditVoucher: (id: number) => void;
}

export function HuvudbokTab({ accounts, transactions, vouchers, onEditVoucher }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setPage(0);
  }, [search]);

  const filteredVouchers = search.trim() === ''
    ? vouchers
    : vouchers.filter(v => matchesSearch(v, transactions, accounts, search));

  const totalPages = Math.ceil(filteredVouchers.length / PAGE_SIZE);
  const pageVouchers = filteredVouchers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Gruppera transaktioner per verifikat en gång — O(V+T) istället för O(V×T)
  const byVoucher = new Map<number, Transaction[]>();
  for (const t of transactions) {
    const list = byVoucher.get(t.voucherId);
    if (list) list.push(t); else byVoucher.set(t.voucherId, [t]);
  }

  const deleteVoucher = async (id: number) => {
    await db.transaction('rw', db.vouchers, db.transactions, async () => {
      await db.transactions.where('voucherId').equals(id).delete();
      await db.vouchers.delete(id);
    });
    setConfirmDelete(null);
  };

  if (vouchers.length === 0) {
    return <p className="text-sm text-slate-400">Inga verifikationer ännu.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök beskrivning, konto eller belopp…"
            aria-label="Sök i huvudbok"
            className={inputCls}
          />
        </div>
        {search.trim() !== '' && (
          <p className="mt-1.5 text-xs text-slate-400">
            {filteredVouchers.length} av {vouchers.length} verifikationer matchar
          </p>
        )}
      </div>

      {filteredVouchers.length === 0 && (
        <p className="text-sm text-slate-400">Inga verifikationer matchar sökningen.</p>
      )}

      {pageVouchers.map(v => {
        const vt = byVoucher.get(v.id!) ?? [];
        return (
          <div key={v.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Ver {v.id}
              </span>
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-slate-900">
                  {v.date} — {v.description}
                </span>
                <button
                  onClick={() => onEditVoucher(v.id!)}
                  className="flex items-center gap-1 rounded-md px-2.5 py-2 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Redigera
                </button>
                {confirmDelete === v.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => deleteVoucher(v.id!)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Bekräfta
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                      Avbryt
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(v.id!)}
                    className="flex items-center gap-1 rounded-md px-2.5 py-2 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Ta bort
                  </button>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Konto</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Debet</th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {vt.map(t => {
                  const a = accounts.find(a => a.id === t.accountId);
                  return (
                    <tr key={t.id} className="border-t border-slate-50">
                      <td className="px-5 py-2 text-slate-700">{t.accountId} {a?.name ?? '(okänt konto)'}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-slate-900">
                        {t.amount > 0 ? t.amount.toFixed(2) : ''}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-slate-900">
                        {t.amount < 0 ? Math.abs(t.amount).toFixed(2) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Föregående
          </button>
          <span className="text-sm text-slate-500">
            Sida {page + 1} av {totalPages} ({filteredVouchers.length} verifikationer)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            Nästa <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
