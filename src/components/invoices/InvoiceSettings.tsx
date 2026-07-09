import React, { useState, useEffect } from 'react';
import { InvoiceMethod } from '../../db';
import {
  CompanySettings, getCompanySettings, saveCompanySettings,
  renderInvoiceHtml, DEFAULT_TEMPLATE, TEMPLATE_TOKENS,
  validateTemplate,
} from '../../lib/invoice';
import { RotateCcw, Eye, AlertTriangle, Pencil } from 'lucide-react';

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
  // Mallredigerare: draft laddas med grundmallen (eller användarens sparade)
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => { getCompanySettings().then(setS); }, []);

  if (!s) return <div className="text-sm text-slate-400">Laddar…</div>;

  const set = (patch: Partial<CompanySettings>) => setS({ ...s, ...patch });

  const handleSave = async () => {
    await saveCompanySettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const startEditing = () => {
    setDraft(s.template?.trim() ? s.template : DEFAULT_TEMPLATE);
    setTplMsg('');
    setEditing(true);
  };

  const draftValidation = validateTemplate(draft);

  const saveTemplate = async () => {
    // Kritiska kopplingar saknas → knappen är avstängd, men dubbelvakt här
    if (draftValidation.missingRequired.length > 0) return;
    const next = { ...s, template: draft };
    setS(next);
    await saveCompanySettings(next);
    setEditing(false);
    setTplMsg(
      draftValidation.missingRecommended.length > 0
        ? 'warn-saved'
        : 'saved',
    );
  };

  const resetTemplate = async () => {
    const next = { ...s, template: undefined };
    setS(next);
    await saveCompanySettings(next);
    setEditing(false);
    setTplMsg('reset');
  };

  const previewTemplate = (html?: string) => {
    const w = window.open('', '_blank');
    if (!w) return;
    // Förhandsgranska draften om vi redigerar, annars den sparade mallen
    w.document.write(renderInvoiceHtml(SAMPLE_INVOICE, html ? { ...s, template: html } : s));
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fakturamall</p>
          <span className="text-xs text-slate-500">
            Aktiv: <span className="font-medium text-slate-900">{s.template ? 'Anpassad' : 'Grundmall'}</span>
          </span>
        </div>

        {!editing ? (
          <>
            <p className="text-sm text-slate-500">
              Fakturan bygger på en färdig grundmall med alla kopplingar till dina uppgifter.
              Du kan ändra <strong>färg, text, typsnitt och layout</strong> direkt — kopplingarna
              (<code className="bg-slate-100 px-1 rounded text-xs">{'{{fält}}'}</code>) måste finnas kvar
              för att beloppen och uppgifterna ska hamna rätt.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={startEditing}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700">
                <Pencil className="h-4 w-4" /> Anpassa mallen
              </button>
              <button onClick={() => previewTemplate()}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                <Eye className="h-4 w-4" /> Förhandsgranska
              </button>
              {s.template && (
                <button onClick={resetTemplate}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                  <RotateCcw className="h-4 w-4" /> Återställ grundmall
                </button>
              )}
            </div>
            {tplMsg === 'saved' && <p className="text-sm text-emerald-600">Mallen sparad ✓</p>}
            {tplMsg === 'warn-saved' && <p className="text-sm text-amber-600">Mallen sparad — men saknar rekommenderade fält (se nedan när du redigerar).</p>}
            {tplMsg === 'reset' && <p className="text-sm text-slate-500">Grundmallen återställd.</p>}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Redigera HTML/CSS fritt. Kopplingarna nedan måste vara kvar — annars hamnar
              uppgifterna inte på fakturan.
            </p>

            {/* Kopplingskontroll — kritiska (blockerar) + rekommenderade (varnar) */}
            {draftValidation.missingRequired.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <strong>Nödvändiga kopplingar saknas — kan inte sparas:</strong>{' '}
                  {draftValidation.missingRequired.map(m => `${m.label} ({{${m.token}}})`).join(', ')}.
                </span>
              </div>
            )}
            {draftValidation.missingRecommended.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <strong>Rekommenderade fält saknas</strong> (krävs oftast på en svensk faktura):{' '}
                  {draftValidation.missingRecommended.map(m => `${m.label} ({{${m.token}}})`).join(', ')}.
                  Du kan spara ändå.
                </span>
              </div>
            )}

            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              spellCheck={false}
              rows={18}
              aria-label="Fakturamallens HTML"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />

            <div className="flex flex-wrap gap-3">
              <button onClick={saveTemplate}
                      disabled={draftValidation.missingRequired.length > 0}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40">
                Spara mallen
              </button>
              <button onClick={() => previewTemplate(draft)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                <Eye className="h-4 w-4" /> Förhandsgranska ändringar
              </button>
              <button onClick={() => { setDraft(DEFAULT_TEMPLATE); }}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                <RotateCcw className="h-4 w-4" /> Börja om från grundmallen
              </button>
              <button onClick={() => setEditing(false)}
                      className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Avbryt
              </button>
            </div>

            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-600">Alla tillgängliga kopplingar (klistra in där du vill ha uppgiften)</summary>
              <p className="mt-2 font-mono leading-6">
                {TEMPLATE_TOKENS.map(t => '{{' + t + '}}').join('  ')}
              </p>
            </details>
          </div>
        )}
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
