import React, { useState } from 'react';
import { format } from 'date-fns';
import { Invoice } from '../../db';
import { formatCurrency } from '../../lib/utils';
import {
  invoiceTotals, registerPayment, cancelInvoice,
  renderInvoiceHtml, getCompanySettings,
} from '../../lib/invoice';
import { Printer, Download, Share2, Mail, Ban, CheckCircle } from 'lucide-react';

const STATUS_BADGE: Record<Invoice['status'], { label: string; cls: string }> = {
  obetald:   { label: 'Obetald',   cls: 'bg-amber-100 text-amber-700'     },
  betald:    { label: 'Betald',    cls: 'bg-emerald-100 text-emerald-700' },
  makulerad: { label: 'Makulerad', cls: 'bg-slate-100 text-slate-500'     },
};

async function getHtml(inv: Invoice): Promise<string> {
  return renderInvoiceHtml(inv, await getCompanySettings());
}

// "Skicka" i en lokal app = skriv ut/PDF, dela som fil, ladda ned eller maila
async function printInvoice(inv: Invoice) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(await getHtml(inv));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250); // låt layouten hinna renderas
}

async function downloadInvoice(inv: Invoice) {
  const blob = new Blob([await getHtml(inv)], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `faktura-${inv.number}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

async function shareInvoice(inv: Invoice) {
  const file = new File([await getHtml(inv)], `faktura-${inv.number}.html`, { type: 'text/html' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `Faktura ${inv.number}` }).catch(() => {});
  } else {
    await downloadInvoice(inv);
  }
}

function mailInvoice(inv: Invoice) {
  const totals = invoiceTotals(inv.rows);
  const subject = encodeURIComponent(`Faktura ${inv.number}`);
  const body = encodeURIComponent(
    `Hej!\n\nHär kommer faktura ${inv.number} på ${formatCurrency(totals.grossTotal)}, ` +
    `förfallodatum ${inv.dueDate}.\n\nFakturan bifogas (ladda ned den från appen och bifoga i detta mail).\n\nVänliga hälsningar`,
  );
  window.location.href = `mailto:${inv.customerEmail ?? ''}?subject=${subject}&body=${body}`;
}

export function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  const [payingId,     setPayingId]     = useState<number | null>(null);
  const [payDate,      setPayDate]      = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [error,        setError]        = useState('');

  const doPay = async (id: number) => {
    setError('');
    try {
      await registerPayment(id, payDate);
      setPayingId(null);
    } catch {
      setError('Kunde inte registrera betalningen.');
    }
  };

  const doCancel = async (id: number) => {
    setError('');
    try {
      await cancelInvoice(id, format(new Date(), 'yyyy-MM-dd'));
      setCancellingId(null);
    } catch {
      setError('Kunde inte makulera fakturan.');
    }
  };

  if (invoices.length === 0) {
    return <p className="text-sm text-slate-400">Inga fakturor ännu. Skapa din första under "Ny faktura".</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {invoices.map(inv => {
        const totals = invoiceTotals(inv.rows);
        const badge  = STATUS_BADGE[inv.status];
        return (
          <div key={inv.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">Faktura {inv.number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    {inv.method === 'faktura' ? 'Fakturametoden' : 'Kontantmetoden'}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500 truncate">
                  {inv.customerName} · {inv.date} · förfaller {inv.dueDate}
                  {inv.paidDate && ` · betald ${inv.paidDate}`}
                </p>
              </div>
              <span className="text-lg font-bold tabular-nums text-slate-900 shrink-0">
                {formatCurrency(totals.grossTotal)}
              </span>
            </div>

            {/* Åtgärder */}
            <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 bg-slate-50 px-3 py-2">
              <IconBtn onClick={() => printInvoice(inv)}    icon={Printer}  label="Skriv ut / PDF" />
              <IconBtn onClick={() => downloadInvoice(inv)} icon={Download} label="Ladda ned" />
              <IconBtn onClick={() => shareInvoice(inv)}    icon={Share2}   label="Dela" />
              <IconBtn onClick={() => mailInvoice(inv)}     icon={Mail}     label="E-post" />

              <span className="flex-1" />

              {inv.status === 'obetald' && (
                payingId === inv.id ? (
                  <span className="flex items-center gap-2">
                    <input
                      type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                      aria-label="Betalningsdatum"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <button onClick={() => doPay(inv.id!)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">
                      Bekräfta
                    </button>
                    <button onClick={() => setPayingId(null)}
                            className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors">
                      Avbryt
                    </button>
                  </span>
                ) : cancellingId === inv.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Makulera fakturan?</span>
                    <button onClick={() => doCancel(inv.id!)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                      Ja, makulera
                    </button>
                    <button onClick={() => setCancellingId(null)}
                            className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors">
                      Avbryt
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <button onClick={() => { setPayingId(inv.id!); setCancellingId(null); }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
                      <CheckCircle className="h-4 w-4" /> Registrera betalning
                    </button>
                    <button onClick={() => { setCancellingId(inv.id!); setPayingId(null); }}
                            aria-label={`Makulera faktura ${inv.number}`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                      <Ban className="h-4 w-4" /> Makulera
                    </button>
                  </span>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IconBtn({ onClick, icon: Icon, label }: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white hover:text-slate-900 transition-colors"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
