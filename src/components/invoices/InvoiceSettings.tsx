import React, { useState, useEffect } from 'react';
import { InvoiceMethod } from '../../db';
import {
  CompanySettings, getCompanySettings, saveCompanySettings,
  renderInvoiceHtml, buildTemplateFromTheme, DEFAULT_THEME, TEMPLATE_TOKENS,
  InvoiceTheme, InvoiceFont, FONT_LABELS, validateTemplate,
} from '../../lib/invoice';
import { RotateCcw, Eye, AlertTriangle, Pencil, Palette, Code, Upload, Image, X } from 'lucide-react';

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

type EditMode = 'none' | 'visual' | 'raw';

export function InvoiceSettings() {
  const [s, setS] = useState<CompanySettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [tplMsg, setTplMsg] = useState('');
  const [mode, setMode] = useState<EditMode>('none');
  const [theme, setTheme] = useState<InvoiceTheme>(DEFAULT_THEME);
  const [draft, setDraft] = useState(''); // avancerad rå HTML
  const [logoErr, setLogoErr] = useState('');

  useEffect(() => { getCompanySettings().then(setS); }, []);

  if (!s) return <div className="text-sm text-slate-400">Laddar…</div>;

  const set = (patch: Partial<CompanySettings>) => setS({ ...s, ...patch });

  const handleSave = async () => {
    await saveCompanySettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // ── Visuell redigering (WYSIWYG) ─────────────────────────────────────────
  const startVisual = () => {
    setTheme(s.invoiceTheme ?? DEFAULT_THEME);
    setTplMsg(''); setLogoErr(''); setMode('visual');
  };
  const setTheme2 = (patch: Partial<InvoiceTheme>) => setTheme(t => ({ ...t, ...patch }));

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoErr('');
    if (!file.type.startsWith('image/')) { setLogoErr('Välj en bildfil (PNG, JPG, SVG).'); return; }
    if (file.size > 500 * 1024) { setLogoErr('Logotypen är för stor — max 500 kB (bäddas in i varje faktura).'); return; }
    const reader = new FileReader();
    reader.onload = () => setTheme2({ logoDataUri: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const saveVisual = async () => {
    // Temat vinner över ev. gammal rå HTML → nollställ template så temat gäller
    const next = { ...s, invoiceTheme: theme, template: undefined };
    setS(next);
    await saveCompanySettings(next);
    setMode('none'); setTplMsg('saved');
  };

  // ── Avancerad rå HTML ────────────────────────────────────────────────────
  const startRaw = () => {
    setDraft(s.template?.trim() ? s.template : buildTemplateFromTheme(s.invoiceTheme ?? DEFAULT_THEME));
    setTplMsg(''); setMode('raw');
  };
  const draftValidation = validateTemplate(draft);
  const saveRaw = async () => {
    if (draftValidation.missingRequired.length > 0) return;
    const next = { ...s, template: draft };
    setS(next);
    await saveCompanySettings(next);
    setMode('none');
    setTplMsg(draftValidation.missingRecommended.length > 0 ? 'warn-saved' : 'saved');
  };

  const resetTemplate = async () => {
    const next = { ...s, template: undefined, invoiceTheme: undefined };
    setS(next);
    await saveCompanySettings(next);
    setMode('none'); setTplMsg('reset');
  };

  // Live-förhandsvisning som HTML-sträng (visuellt tema resp. rå draft)
  const previewHtml = (over: Partial<CompanySettings>) =>
    renderInvoiceHtml(SAMPLE_INVOICE, { ...s, ...over });

  const openPreview = (html: string) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html); w.document.close();
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
            Aktiv: <span className="font-medium text-slate-900">
              {s.template ? 'Egen HTML' : s.invoiceTheme ? 'Anpassat tema' : 'Grundmall'}
            </span>
          </span>
        </div>

        {mode === 'none' && (
          <>
            <p className="text-sm text-slate-500">
              Anpassa fakturans utseende — färg, typsnitt, rubrik, fottext och logotyp — och se
              ändringen direkt. Alla kopplingar till dina belopp och uppgifter behålls automatiskt.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={startVisual}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700">
                <Palette className="h-4 w-4" /> Anpassa utseende
              </button>
              <button onClick={() => openPreview(renderInvoiceHtml(SAMPLE_INVOICE, s))}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                <Eye className="h-4 w-4" /> Förhandsgranska
              </button>
              <button onClick={startRaw}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50">
                <Code className="h-4 w-4" /> Avancerat (HTML)
              </button>
              {(s.template || s.invoiceTheme) && (
                <button onClick={resetTemplate}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50">
                  <RotateCcw className="h-4 w-4" /> Återställ grundmall
                </button>
              )}
            </div>
            {tplMsg === 'saved' && <p className="text-sm text-emerald-600">Sparat ✓</p>}
            {tplMsg === 'warn-saved' && <p className="text-sm text-amber-600">Sparat — men vissa rekommenderade fält saknas i din HTML.</p>}
            {tplMsg === 'reset' && <p className="text-sm text-slate-500">Grundmallen återställd.</p>}
          </>
        )}

        {/* ── WYSIWYG: kontroller + live-förhandsvisning ── */}
        {mode === 'visual' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Accentfärg" value={theme.accent} onChange={v => setTheme2({ accent: v })} />
                <ColorField label="Rubrikfärg" value={theme.heading} onChange={v => setTheme2({ heading: v })} />
              </div>
              <Field label="Typsnitt">
                <select value={theme.font} onChange={e => setTheme2({ font: e.target.value as InvoiceFont })}
                        aria-label="Typsnitt" className={cls}>
                  {(Object.keys(FONT_LABELS) as InvoiceFont[]).map(f => (
                    <option key={f} value={f}>{FONT_LABELS[f]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rubriktext">
                <input type="text" value={theme.headingText} maxLength={40}
                       aria-label="Rubriktext"
                       onChange={e => setTheme2({ headingText: e.target.value })} className={cls} />
              </Field>
              <Field label="Fottext (tackrader)">
                <textarea value={theme.footerText} rows={2} maxLength={200}
                          aria-label="Fottext"
                          onChange={e => setTheme2({ footerText: e.target.value })}
                          className={cls + ' resize-none'} />
              </Field>
              <Field label="Logotyp">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    {theme.logoDataUri ? <Image className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                    {theme.logoDataUri ? 'Byt logotyp' : 'Ladda upp'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogo} aria-label="Ladda upp logotyp" />
                  </label>
                  {theme.logoDataUri && (
                    <button onClick={() => setTheme2({ logoDataUri: undefined })}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:text-red-600 transition-colors">
                      <X className="h-4 w-4" /> Ta bort
                    </button>
                  )}
                </div>
                {logoErr && <p className="mt-1 text-xs text-red-600">{logoErr}</p>}
                <p className="mt-1 text-xs text-slate-400">Bild max 500 kB — bäddas in i fakturan (fungerar offline).</p>
              </Field>

              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={saveVisual}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors">
                  Spara utseende
                </button>
                <button onClick={() => setTheme(DEFAULT_THEME)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <RotateCcw className="h-4 w-4" /> Standard
                </button>
                <button onClick={() => setMode('none')}
                        className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  Avbryt
                </button>
              </div>
            </div>

            {/* Live-förhandsvisning */}
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 overflow-hidden">
              <iframe
                title="Förhandsvisning av faktura"
                srcDoc={previewHtml({ invoiceTheme: theme, template: undefined })}
                className="h-[520px] w-full rounded bg-white"
              />
            </div>
          </div>
        )}

        {/* ── Avancerat: rå HTML med kopplingskontroll ── */}
        {mode === 'raw' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Redigera HTML/CSS fritt. Kopplingarna måste vara kvar — annars hamnar uppgifterna
              inte på fakturan. (Sparar du här ersätts det visuella temat.)
            </p>
            {draftValidation.missingRequired.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>Nödvändiga kopplingar saknas — kan inte sparas:</strong>{' '}
                  {draftValidation.missingRequired.map(m => `${m.label} ({{${m.token}}})`).join(', ')}.</span>
              </div>
            )}
            {draftValidation.missingRecommended.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>Rekommenderade fält saknas</strong> (krävs oftast på en svensk faktura):{' '}
                  {draftValidation.missingRecommended.map(m => `${m.label} ({{${m.token}}})`).join(', ')}. Du kan spara ändå.</span>
              </div>
            )}
            <textarea value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false} rows={16}
                      aria-label="Fakturamallens HTML"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <div className="flex flex-wrap gap-3">
              <button onClick={saveRaw} disabled={draftValidation.missingRequired.length > 0}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 transition-colors">
                Spara HTML
              </button>
              <button onClick={() => openPreview(previewHtml({ template: draft }))}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <Eye className="h-4 w-4" /> Förhandsgranska
              </button>
              <button onClick={() => setMode('none')}
                      className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Avbryt
              </button>
            </div>
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-600">Alla tillgängliga kopplingar</summary>
              <p className="mt-2 font-mono leading-6">{TEMPLATE_TOKENS.map(t => '{{' + t + '}}').join('  ')}</p>
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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-slate-500">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
               aria-label={label}
               className="h-9 w-10 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
               className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900" />
      </div>
    </div>
  );
}
