import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Invoice } from '../db';
import { InvoiceList } from './invoices/InvoiceList';
import { InvoiceForm } from './invoices/InvoiceForm';
import { InvoiceSettings } from './invoices/InvoiceSettings';

type Tab = 'lista' | 'ny' | 'installningar';

const TABS: { id: Tab; label: string }[] = [
  { id: 'lista',         label: 'Fakturor'      },
  { id: 'ny',            label: 'Ny faktura'    },
  { id: 'installningar', label: 'Inställningar' },
];

export function Invoices() {
  const invoices = useLiveQuery(() => db.invoices.orderBy('number').reverse().toArray());
  const [tab, setTab] = useState<Tab>('lista');
  const [justCreated, setJustCreated] = useState<Invoice | null>(null);

  if (!invoices) return <div className="text-sm text-slate-400">Laddar…</div>;

  const onCreated = (inv: Invoice) => {
    setJustCreated(inv);
    setTab('lista');
    setTimeout(() => setJustCreated(null), 6000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Fakturering</h1>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {justCreated && tab === 'lista' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Faktura {justCreated.number} skapad
          {justCreated.method === 'faktura' ? ' och bokförd' : ''} — arkiverad i appen (knappen "Visa"){' '}
          och nedladdad som fil om inställningen är på. Skicka via E-post, Dela eller Skriv ut nedan.
        </div>
      )}

      {tab === 'lista'         && <InvoiceList invoices={invoices} />}
      {tab === 'ny'            && <InvoiceForm onCreated={onCreated} />}
      {tab === 'installningar' && <InvoiceSettings />}
    </div>
  );
}
