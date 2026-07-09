import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Plus, Trash2, ScanLine, Paperclip, X } from 'lucide-react';
import { format } from 'date-fns';
import { scanReceipt } from '../lib/ocr';
import {
  VAT_OUT, VAT_IN, splitVat,
  reverseChargeRows, reverseVat, ReverseKind, REVERSE_LABELS,
} from '../lib/vat';
import { uttaqTemplates, TEMPLATE_LABELS } from '../lib/tax';
import { addAttachment, validateAttachmentFile, AttachmentError } from '../lib/attachments';
import { HelpButton } from './AiHelp';

type Row = { accountId: number | string; debit: string; credit: string };

// Momshjälpens lägen: vanlig ut-/ingående moms + omvänd skattskyldighet (utland).
// REVERSE_KINDS härleds ur REVERSE_LABELS (enda källan) så att ett nytt läge aldrig
// kan glömmas här.
type VatMode = 'out' | 'in' | ReverseKind;
const REVERSE_KINDS = Object.keys(REVERSE_LABELS) as ReverseKind[];
const isReverseMode = (m: VatMode): m is ReverseKind => (REVERSE_KINDS as string[]).includes(m);

// Pedagogiska förklaringar per förvärvstyp + fråga som startar AI-hjälpen fokuserad
const REVERSE_INFO: Record<ReverseKind, { origin: string; box: string; import?: boolean }> = {
  'eu-service':     { origin: 'ett annat EU-land',     box: 'ruta 21' },
  'non-eu-service': { origin: 'ett land utanför EU',   box: 'ruta 22' },
  'eu-goods':       { origin: 'ett annat EU-land',     box: 'ruta 20' },
  'non-eu-goods':   { origin: 'ett land utanför EU',   box: 'ruta 50', import: true },
};
const REVERSE_HELP_SEED: Record<ReverseKind, string> = {
  'eu-service':     'Jag är i Bokför-fliken och ska bokföra omvänd moms (förvärvsmoms) på en tjänst köpt från ett annat EU-land, t.ex. en prenumeration. Förklara pedagogiskt steg för steg hur omvänd skattskyldighet fungerar, vilka konton och momsrutor som berörs och hur jag gör i appens momshjälp.',
  'non-eu-service': 'Jag är i Bokför-fliken och ska bokföra omvänd moms (förvärvsmoms) på en tjänst köpt från ett land utanför EU. Förklara pedagogiskt hur omvänd skattskyldighet fungerar, vilka konton och momsrutor som berörs och hur jag gör i appen.',
  'eu-goods':       'Jag är i Bokför-fliken och ska bokföra omvänd moms på varor köpta från ett annat EU-land (unionsinternt förvärv). Förklara pedagogiskt hur förvärvsmoms fungerar, vilka konton och momsrutor som berörs och hur jag gör i appen.',
  'non-eu-goods':   'Jag är i Bokför-fliken och ska bokföra import av varor från ett land utanför EU. Förklara pedagogiskt hur importmoms fungerar: vad beskattningsunderlaget (tullvärde + tull från Tullverkets tullräkning) är, vilka konton (4545/2616/2645) och momsrutor (50, 60, 48) som berörs, och hur jag gör i appen.',
};

const cls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 ' +
  'focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400';

export function VoucherEntry({ editId, onEditDone }: { editId?: number | null; onEditDone?: () => void }) {
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray());

  const [date, setDate]               = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [rows, setRows]               = useState<Row[]>([
    { accountId: '', debit: '', credit: '' },
    { accountId: '', debit: '', credit: '' },
  ]);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [saving,   setSaving]  = useState(false);
  const [scanning, setScanning] = useState(false);
  // Kvittobilagor som sparas tillsammans med verifikatet (P5)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const addPendingFile = (file: File) => {
    try {
      validateAttachmentFile(file);
      setPendingFiles(p => [...p, file]);
    } catch (e) {
      setError(e instanceof AttachmentError ? e.message : 'Kunde inte läsa filen.');
    }
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true); setError('');
    try {
      const data = await scanReceipt(file);
      addPendingFile(file); // kvittobilden sparas som bilaga när verifikatet bokförs
      if (data.date)   setDate(data.date);
      if (data.vendor) setDescription(data.vendor);

      const dir   = data.vatDir ?? 'in';
      const rate  = data.vatRate ?? 0;
      const gross = data.amount  ?? 0;
      if (rate)  setVatRate(rate as 0 | 6 | 12 | 25);
      if (gross) setVatGross(String(gross));
      setVatDir(dir);

      // Auto-fill accounting rows immediately — no need to click "Fyll i rader"
      if (rate && gross) {
        const { net, vat } = splitVat(gross, rate);
        const vatAcc = dir === 'out' ? VAT_OUT[rate] : VAT_IN;
        setRows(
          dir === 'out'
            ? [
                { accountId: 1930,   debit: String(gross), credit: '' },
                { accountId: '',     debit: '',              credit: String(net) },
                { accountId: vatAcc, debit: '',              credit: String(vat) },
              ]
            : [
                { accountId: '',     debit: String(net),   credit: '' },
                { accountId: vatAcc, debit: String(vat),   credit: '' },
                { accountId: 1930,   debit: '',             credit: String(gross) },
              ],
        );
      }
    } catch {
      setError('Kunde inte läsa kvittot. Kontrollera att GEMINI_API_KEY är konfigurerad.');
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  // Load existing voucher when editId changes
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const v  = await db.vouchers.get(editId);
      const ts = await db.transactions.where('voucherId').equals(editId).toArray();
      if (!v) return;
      setDate(v.date);
      setDescription(v.description);
      setRows(ts.map(t => ({
        accountId: t.accountId,
        debit:  t.amount > 0 ? String(t.amount) : '',
        credit: t.amount < 0 ? String(Math.abs(t.amount)) : '',
      })));
      setError(''); setSuccess('');
    })();
  }, [editId]);

  // VAT helper
  const [vatRate, setVatRate] = useState<0 | 6 | 12 | 25>(0);
  const [vatDir,  setVatDir]  = useState<VatMode>('in');
  const [vatGross, setVatGross] = useState('');

  const grossNum = parseFloat(vatGross) || 0;
  const reverse  = isReverseMode(vatDir);
  const isImport = vatDir === 'non-eu-goods';
  const amountLabel = isImport
    ? 'Beskattningsunderlag (tullräkning)'
    : reverse ? 'Fakturabelopp (utan moms)' : 'Belopp inkl. moms';
  // Vid omvänd moms är det angivna beloppet NETTO (fakturan är momsfri) och
  // momsen beräknas ovanpå; annars är beloppet inkl. moms och delas upp.
  const { net, vat } =
    vatRate === 0        ? { net: grossNum, vat: 0 } :
    reverse              ? { net: grossNum, vat: reverseVat(grossNum, vatRate) } :
                           splitVat(grossNum, vatRate);

  const applyVat = () => {
    if (!vatRate || !grossNum) return;
    if (reverse) {
      // Omvänd skattskyldighet: 4 färdigkonterade rader (alla konton förvalda)
      const rows = reverseChargeRows(grossNum, vatRate as 6 | 12 | 25, vatDir as ReverseKind);
      setRows(rows.map(r => ({
        accountId: r.accountId,
        debit:  r.debit  > 0 ? String(r.debit)  : '',
        credit: r.credit > 0 ? String(r.credit) : '',
      })));
      setVatGross('');
      return;
    }
    const vatAcc = vatDir === 'out' ? VAT_OUT[vatRate] : VAT_IN;
    setRows(
      vatDir === 'out'
        ? [
            { accountId: 1930,   debit: String(grossNum), credit: '' },
            { accountId: '',     debit: '',                credit: String(net) },
            { accountId: vatAcc, debit: '',                credit: String(vat) },
          ]
        : [
            { accountId: '',     debit: String(net),  credit: '' },
            { accountId: vatAcc, debit: String(vat),  credit: '' },
            { accountId: 1930,   debit: '',            credit: String(grossNum) },
          ],
    );
    setVatGross('');
  };

  const addRow    = () => setRows(r => [...r, { accountId: '', debit: '', credit: '' }]);
  const removeRow = (i: number) => { if (rows.length > 2) setRows(r => r.filter((_, j) => j !== i)); };

  const updateRow = (i: number, field: keyof Row, value: string | number) =>
    setRows(r => {
      const n = r.map((row, j) => j !== i ? row : { ...row, [field]: value });
      if (field === 'debit'  && value !== '') n[i].credit = '';
      if (field === 'credit' && value !== '') n[i].debit  = '';
      return n;
    });

  // Only rows with an account selected will be saved — balance must be checked on those rows only
  const valid       = rows.filter(r => r.accountId && (r.debit || r.credit));
  const totalDebit  = valid.reduce((s, r) => s + (parseFloat(r.debit  as string) || 0), 0);
  const totalCredit = valid.reduce((s, r) => s + (parseFloat(r.credit as string) || 0), 0);
  const diff        = Math.round((totalDebit - totalCredit) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!date || !description) { setError('Datum och beskrivning krävs.'); return; }
    if (valid.length < 2)      { setError('Minst två konteringsrader krävs.'); return; }
    if (Math.abs(diff) > 0.01) {
      setError(`Debet och kredit balanserar inte — differens: ${diff.toFixed(2)} kr`);
      return;
    }
    setSaving(true);
    let savedVoucherId: number | null = editId ?? null;
    try {
      await db.transaction('rw', db.vouchers, db.transactions, async () => {
        if (editId) {
          await db.vouchers.update(editId, { date, description });
          await db.transactions.where('voucherId').equals(editId).delete();
          for (const row of valid) {
            const d = parseFloat(row.debit  as string) || 0;
            const c = parseFloat(row.credit as string) || 0;
            await db.transactions.add({ voucherId: editId, accountId: Number(row.accountId), amount: d > 0 ? d : -c });
          }
        } else {
          const vid = await db.vouchers.add({ date, description, created_at: Date.now() });
          savedVoucherId = vid as number;
          for (const row of valid) {
            const d = parseFloat(row.debit  as string) || 0;
            const c = parseFloat(row.credit as string) || 0;
            await db.transactions.add({ voucherId: vid, accountId: Number(row.accountId), amount: d > 0 ? d : -c });
          }
        }
      });
      // Bilagor sparas efter verifikatet (egen tabell)
      for (const f of pendingFiles) {
        await addAttachment(savedVoucherId!, f);
      }
      setPendingFiles([]);
      setSuccess(editId ? 'Verifikation uppdaterad.' : 'Verifikation bokförd.');
      if (!editId) {
        setDescription('');
        setVatRate(0);
        setRows([
          { accountId: '', debit: '', credit: '' },
          { accountId: '', debit: '', credit: '' },
        ]);
      }
      onEditDone?.();
      setTimeout(() => setSuccess(''), 4000);
    } catch {
      setError('Kunde inte spara. Försök igen.');
    } finally {
      setSaving(false);
    }
  };

  // ── Uttags-guide ─────────────────────────────────────────────────────────
  const [quickAmount, setQuickAmount] = useState('');

  const applyTemplate = (idx: number) => {
    const amount = parseFloat(quickAmount) || 0;
    if (!amount) return;
    const tmpl = uttaqTemplates(amount)[idx];
    setDescription(tmpl.description);
    setRows(tmpl.rows.map(r => ({
      accountId: r.accountId,
      debit:  r.debit  > 0 ? String(r.debit)  : '',
      credit: r.credit > 0 ? String(r.credit) : '',
    })));
    setQuickAmount('');
  };

  const QUICK = TEMPLATE_LABELS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          {editId ? `Redigera verifikat ${editId}` : 'Ny verifikation'}
        </h1>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
          scanning
            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-wait'
            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}>
          <ScanLine className="h-4 w-4" />
          {scanning ? 'Skannar…' : 'Skanna kvitto'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScan} disabled={scanning} />
        </label>
      </div>

      {/* Uttags-guide */}
      {!editId && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Snabbval — egna uttag &amp; skatt</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Belopp (kr)</label>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={quickAmount}
                onChange={e => setQuickAmount(e.target.value)}
                placeholder="0.00"
                className={cls + ' w-36'}
              />
            </div>
            {QUICK.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyTemplate(i)}
                disabled={!quickAmount || parseFloat(quickAmount) <= 0}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-900 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Ange ett belopp och klicka på snabbvalet för att fylla i konteringsrader automatiskt.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Date + description */}
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Datum</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={cls} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Beskrivning</label>
            <input
              type="text" required value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="T.ex. Inköp kontorsmaterial"
              className={cls}
            />
          </div>
        </div>

        {/* Bilagor (P5) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Kvittobilagor</p>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <Paperclip className="h-4 w-4" /> Bifoga kvitto
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                aria-label="Bifoga kvitto"
                onChange={e => {
                  for (const f of Array.from(e.target.files ?? [])) addPendingFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="text-xs text-slate-400">Bild eller PDF, max 8 MB — sparas med verifikatet</span>
          </div>
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  <Paperclip className="h-3 w-3 text-slate-400" />
                  {f.name}
                  <button
                    type="button"
                    onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}
                    aria-label={`Ta bort bilagan ${f.name}`}
                    className="rounded p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* VAT helper */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Momshjälp</p>

          <div className="flex flex-wrap gap-3 items-end">
            {/* Rate */}
            <div>
              <label className="mb-1 block text-xs text-slate-500">Momssats</label>
              <select
                value={vatRate}
                onChange={e => setVatRate(Number(e.target.value) as 0 | 6 | 12 | 25)}
                className={cls + ' w-36'}
              >
                <option value={0}>Ingen moms</option>
                <option value={6}>6 %</option>
                <option value={12}>12 %</option>
                <option value={25}>25 %</option>
              </select>
            </div>

            {vatRate > 0 && (
              <>
                {/* Direction */}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Typ</label>
                  <select value={vatDir} onChange={e => setVatDir(e.target.value as VatMode)} className={cls + ' w-64'}>
                    <option value="out">Utgående (försäljning)</option>
                    <option value="in">Ingående (inköp)</option>
                    <optgroup label="Omvänd skattskyldighet (utland)">
                      <option value="eu-service">{REVERSE_LABELS['eu-service']}</option>
                      <option value="non-eu-service">{REVERSE_LABELS['non-eu-service']}</option>
                      <option value="eu-goods">{REVERSE_LABELS['eu-goods']}</option>
                      <option value="non-eu-goods">{REVERSE_LABELS['non-eu-goods']}</option>
                    </optgroup>
                  </select>
                </div>

                {/* Gross amount */}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    {amountLabel}
                  </label>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={vatGross}
                    onChange={e => setVatGross(e.target.value)}
                    placeholder="0.00"
                    aria-label={amountLabel}
                    className={cls + ' w-36'}
                  />
                </div>

                {/* Preview */}
                {grossNum > 0 && (
                  <div className="text-sm text-slate-500 self-end pb-2">
                    Netto <span className="font-semibold text-slate-900">{net.toFixed(2)} kr</span>
                    {' + '}{reverse ? 'beräknad moms' : 'moms'} <span className="font-semibold text-slate-900">{vat.toFixed(2)} kr</span>
                  </div>
                )}

                {/* Apply button */}
                <button
                  type="button"
                  onClick={applyVat}
                  disabled={!grossNum}
                  className="self-end rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  Fyll i rader
                </button>
              </>
            )}
          </div>

          {/* Pedagogisk hjälpruta för omvänd skattskyldighet + kontextuell AI-hjälp */}
          {reverse && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-indigo-900">
                {isImport ? 'Import av varor (importmoms)' : 'Omvänd skattskyldighet (förvärvsmoms)'}
              </p>
              {isImport ? (
                <p className="text-[13px] leading-relaxed text-indigo-800/90">
                  Vid import beräknas momsen på <strong>beskattningsunderlaget</strong> (tullvärde + tull och
                  frakt) som står på <strong>Tullverkets tullräkning</strong> — inte på säljarens faktura.
                  Ange det beloppet ovan. Appen bokför <strong>beräknad utgående</strong> och{' '}
                  <strong>ingående moms</strong> (konto <strong>2645</strong>) som tar ut varandra. Redovisas i
                  momsdeklarationens <strong>ruta 50</strong> (underlag) och <strong>60</strong> samt ruta 48.
                  Varukostnad och tullavgift bokförs separat.
                </p>
              ) : (
                <p className="text-[13px] leading-relaxed text-indigo-800/90">
                  Säljaren i {REVERSE_INFO[vatDir as ReverseKind].origin} fakturerar <strong>utan moms</strong>.
                  Du redovisar själv svensk moms: appen bokför <strong>beräknad utgående</strong> och{' '}
                  <strong>ingående moms</strong> (konto <strong>2645</strong>) som tar ut varandra —
                  nettoeffekten blir noll när köpet är avdragsgillt. Ange fakturabeloppet <em>utan moms</em> ovan.
                  Redovisas i momsdeklarationens {REVERSE_INFO[vatDir as ReverseKind].box} samt ruta 30/31/32 och 48.
                </p>
              )}
              <HelpButton
                seed={REVERSE_HELP_SEED[vatDir as ReverseKind]}
                label={isImport ? 'Förklara importmoms för mig' : 'Förklara omvänd moms för mig'}
              />
            </div>
          )}

          {vatRate > 0 && grossNum > 0 && (
            <p className="text-xs text-slate-400">
              {reverse
                ? 'Beräknad utgående och ingående moms bokförs automatiskt. Klicka "Fyll i rader" — kontona är redan förvalda.'
                : `Klicka "Fyll i rader" — välj sedan konto för ${vatDir === 'out' ? 'intäkt' : 'kostnad'} i tabellen nedan.`}
            </p>
          )}
        </div>

        {/* Rows */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Desktop table header */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_7rem_7rem_2rem] border-b border-slate-100 px-4 py-3 gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Konto</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Debet</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Kredit</span>
            <span />
          </div>

          {rows.map((row, i) => (
            <div key={i} className="border-t border-slate-100 first:border-0 p-3 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1fr_7rem_7rem_2.75rem] sm:items-center sm:gap-2 sm:px-4 sm:py-2">
              {/* Account — full width on mobile */}
              <select
                value={row.accountId}
                onChange={e => updateRow(i, 'accountId', e.target.value)}
                aria-label={`Konto rad ${i + 1}`}
                className={cls}
              >
                <option value="">Välj konto…</option>
                {accounts?.map(a => (
                  <option key={a.id} value={a.id}>{a.id} – {a.name}</option>
                ))}
              </select>

              {/* Debet + Kredit side by side on mobile */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <div className="sm:contents">
                  <label className="sm:hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5 block">Debet</label>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={row.debit}
                    onChange={e => updateRow(i, 'debit', e.target.value)}
                    disabled={row.credit !== ''}
                    placeholder="0.00"
                    aria-label={`Debet rad ${i + 1}`}
                    className={cls}
                  />
                </div>
                <div className="sm:contents">
                  <label className="sm:hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5 block">Kredit</label>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={row.credit}
                    onChange={e => updateRow(i, 'credit', e.target.value)}
                    disabled={row.debit !== ''}
                    placeholder="0.00"
                    aria-label={`Kredit rad ${i + 1}`}
                    className={cls}
                  />
                </div>
              </div>

              <div className="flex justify-end sm:justify-center">
                <button
                  type="button" onClick={() => removeRow(i)} disabled={rows.length <= 2}
                  aria-label={`Ta bort rad ${i + 1}`}
                  className="rounded p-2.5 text-slate-300 transition-colors hover:text-red-500 disabled:opacity-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Totals — flex på mobil (raderna staplas där), grid linjerad med kolumnerna på desktop */}
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_7rem_7rem_2.75rem] sm:gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:text-right">Summa</span>
            <span className="font-semibold tabular-nums text-slate-900 text-sm">
              <span className="sm:hidden text-[10px] font-semibold uppercase text-slate-400 mr-1">D</span>{totalDebit.toFixed(2)}
            </span>
            <span className="font-semibold tabular-nums text-slate-900 text-sm">
              <span className="sm:hidden text-[10px] font-semibold uppercase text-slate-400 mr-1">K</span>{totalCredit.toFixed(2)}
            </span>
            <span className="hidden sm:block" />
          </div>
          {Math.abs(diff) > 0.01 && (
            <div className="px-4 py-1.5 text-right text-xs text-red-500">
              Differens: {Math.abs(diff).toFixed(2)} kr
            </div>
          )}
        </div>

        {/* Add row + submit */}
        <div className="flex items-center justify-between">
          <button
            type="button" onClick={addRow}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <Plus className="h-4 w-4" /> Lägg till rad
          </button>
          <button
            type="submit"
            disabled={Math.abs(diff) > 0.01 || valid.length < 2 || saving}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Sparar…' : editId ? 'Uppdatera' : 'Bokför'}
          </button>
        </div>

        {error   && <Notice type="error">{error}</Notice>}
        {success && <Notice type="success">{success}</Notice>}
      </form>
    </div>
  );
}

function Notice({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  const c = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-600'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return <p className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</p>;
}
