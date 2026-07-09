import React, { useState, useEffect, useRef } from 'react';
import { InvoiceMethod } from '../../db';
import {
  CompanySettings, getCompanySettings, saveCompanySettings,
  renderInvoiceHtml, TEMPLATE_TOKENS,
} from '../../lib/invoice';
import { Upload, RotateCcw, Eye } from 'lucide-react';

const cls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 ' +
  'focus:border-transparent';

// Exempeldata för mall-förhandsgranskning
const SAMPLE_INVOICE = {
  number: 1001, date: '2026-07-08', dueDate: '2026-08-07',
  customerName: 'Exempelkund AB', customerAddress: 'Storgatan 1\n111 22 Stockholm',
  customerOrgnr: '556000-0000', customerReference: 'Marknadschef',
  rows: [
    { description: 'Strategisk digital rådgivning', qty: 10, unitPrice: 1250, vatRate: 25 as const },
    { description: 'UX Design Sprint', qty: 1, unitPrice: 18000, vatRate: 25 as const },
  ],
  method: 'faktura' as const, status: 'obetald' as const, created_at: 0,
};

export function InvoiceSettings() {
  const [s, setS] = useState<CompanySettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [tplMsg, setTplMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getCompanySettings().then(setS); }, []);

  if (!s) return <div className="text-sm text-slate-400">Laddar…</div>;

  const set = (patch: Partial<CompanySettings>) => setS({ ...s, ...patch });

  const handleSave = async () => {
    await saveCompanySettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTemplateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const html = await file.text();
    if (!html.includes('{{')) {
      setTplMsg('Filen innehåller inga {{tokens}} — kontrollera att det är en fakturamall.');
    } else {
      const next = { ...s, template: html };
      setS(next);
      await saveCompanySettings(next);
      setTplMsg(`Egen mall importerad (${file.name}).`);
    }
    e.target.value = '';
  };

  const resetTemplate = async () => {
    const next = { ...s, template: undefined };
    setS(next);
    await saveCompanySettings(next);
    setTplMsg('Standardmallen återställd.');
  };

  const previewTemplate = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(renderInvoiceHtml(SAMPLE_INVOICE, s));
    w.document.close();
  };

  return (
    <div className="space-y-4">
      {/* Företagsuppgifter */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Företagsuppgifter — visas på fakturan
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Företagsnamn *">
            <input type="text" value={s.name} onChange={e => set({ name: e.target.value })} className={cls} />
          </Field>
          <Field label="Organisationsnummer">
            <input type="text" value={s.orgnr} onChange={e => set({ orgnr: e.target.value })}
                   placeholder="XXXXXX-XXXX" className={cls} />
          </Field>
          <Field label="Momsregistreringsnummer">
            <input type="text" value={s.momsnr} onChange={e => set({ momsnr: e.target.value })}
                   placeholder="SEXXXXXXXXXX01" className={cls} />
          </Field>
          <Field label="Bankgiro / Plusgiro">
            <input type="text" value={s.bankgiro} onChange={e => set({ bankgiro: e.target.value })}
                   placeholder="123-4567" className={cls} />
          </Field>
          <Field label="Kontaktperson (Vår referens)">
            <input type="text" value={s.contactPerson ?? ''} onChange={e => set({ contactPerson: e.target.value })}
                   placeholder="Namn på fakturan" className={cls} />
          </Field>
          <Field label="Bank">
            <input type="text" value={s.bankName ?? ''} onChange={e => set({ bankName: e.target.value })}
                   placeholder="T.ex. Nordea" className={cls} />
          </Field>
          <Field label="IBAN">
            <input type="text" value={s.iban ?? ''} onChange={e => set({ iban: e.target.value })}
                   placeholder="SE00 0000 0000 0000 0000 0000" className={cls} />
          </Field>
          <Field label="Adress">
            <textarea value={s.address} onChange={e => set({ address: e.target.value })}
                      rows={2} className={cls + ' resize-none'} />
          </Field>
          <div className="space-y-4">
            <Field label="E-post">
              <input type="email" value={s.email} onChange={e => set({ email: e.target.value })} className={cls} />
            </Field>
            <Field label="Telefon">
              <input type="tel" value={s.phone} onChange={e => set({ phone: e.target.value })} className={cls} />
            </Field>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={s.approvedForFskatt !== false}
            onChange={e => set({ approvedForFskatt: e.target.checked })}
          />
          Visa "Godkänd för F-skatt" på fakturan
        </label>
      </div>

      {/* Fakturainställningar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fakturainställningar</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Nästa fakturanummer">
            <input
              type="number" min="1" inputMode="numeric"
              value={s.nextInvoiceNumber}
              onChange={e => set({ nextInvoiceNumber: Math.max(1, parseInt(e.target.value) || 1) })}
              className={cls}
            />
          </Field>
          <Field label="Betalningsvillkor (dagar)">
            <input
              type="number" min="0" inputMode="numeric"
              value={s.paymentTermsDays}
              onChange={e => set({ paymentTermsDays: Math.max(0, parseInt(e.target.value) || 0) })}
              className={cls}
            />
          </Field>
          <Field label="Standard bokföringsmetod">
            <select value={s.defaultMethod} onChange={e => set({ defaultMethod: e.target.value as InvoiceMethod })} className={cls}>
              <option value="faktura">Fakturametoden (vid skapande)</option>
              <option value="kontant">Kontantmetoden (vid betalning)</option>
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-400">
          Fakturanummer räknas alltid uppåt och återanvänds aldrig — nummerserien ska vara obruten enligt bokföringslagen.
          Ändra bara startnumret om du byter från ett annat faktureringssystem.
        </p>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={s.autoDownloadInvoice !== false}
            onChange={e => set({ autoDownloadInvoice: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            Ladda ned fakturafilen till datorn automatiskt när fakturan skapas
            <span className="block text-xs text-slate-400">
              Fakturan arkiveras alltid i appen oavsett — med nedladdningen får du dessutom en egen fil i din nedladdningsmapp.
            </span>
          </span>
        </label>
      </div>

      {/* Fakturamall */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fakturamall</p>
        <p className="text-sm text-slate-500">
          Aktiv mall: <span className="font-medium text-slate-900">{s.template ? 'Egen (importerad)' : 'Standard'}</span>.
          Importera en egen HTML-fil med tokens som{' '}
          {TEMPLATE_TOKENS.slice(0, 4).map(t => (
            <code key={t} className="bg-slate-100 px-1 rounded text-xs mr-1">{'{{' + t + '}}'}</code>
          ))}
          m.fl.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <Upload className="h-4 w-4" /> Importera HTML-mall
            <input ref={fileRef} type="file" accept=".html,.htm" className="hidden" onChange={handleTemplateFile} />
          </label>
          <button onClick={previewTemplate}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <Eye className="h-4 w-4" /> Förhandsgranska
          </button>
          {s.template && (
            <button onClick={resetTemplate}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
              <RotateCcw className="h-4 w-4" /> Återställ standardmall
            </button>
          )}
        </div>
        {tplMsg && <p className="text-sm text-slate-500">{tplMsg}</p>}
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer hover:text-slate-600">Alla tillgängliga tokens</summary>
          <p className="mt-2 font-mono leading-6">
            {TEMPLATE_TOKENS.map(t => '{{' + t + '}}').join('  ')}
          </p>
        </details>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700">
          Spara inställningar
        </button>
        {saved && <span className="text-sm text-emerald-600">Sparat ✓</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-slate-500">{label}</label>
      {children}
    </div>
  );
}
