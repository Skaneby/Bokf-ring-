import React, { useState, useEffect } from 'react';
import { CheckCircle, ScanLine, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, genId } from '../db';
import { scanReceipt, hasOcrKey, OCR_NO_KEY_MESSAGE } from '../lib/ocr';
import { CaptureGrid } from './batchscan/CaptureGrid';
import { ReviewList } from './batchscan/ReviewList';
import type { ScanItem, VoucherDraft } from './batchscan/types';

type Phase = 'capturing' | 'scanning' | 'reviewing' | 'done';

const DEFAULT_EXPENSE_ACCOUNT = 5410; // Förbrukningsinventarier
const DEFAULT_REVENUE_ACCOUNT = 3000; // Försäljning 25%

function makeDraft(override?: Partial<VoucherDraft>): VoucherDraft {
  return {
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    gross: 0,
    vatRate: 25,
    vatDir: 'in',
    accountId: DEFAULT_EXPENSE_ACCOUNT,
    ...override,
  };
}

export function BatchScan() {
  const [phase, setPhase] = useState<Phase>('capturing');
  const [items, setItems] = useState<ScanItem[]>([]);
  const [bookedCount, setBookedCount] = useState(0);
  const [keyError, setKeyError] = useState('');

  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray(), []) ?? [];

  // Frigör object URLs när komponenten unmountas
  useEffect(() => {
    return () => {
      items.forEach(i => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: FileList) => {
    const newItems: ScanItem[] = Array.from(files).map(file => ({
      id: genId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'queued',
      draft: makeDraft(),
      selected: true,
    }));
    setItems(prev => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const startScanning = async () => {
    if (items.length === 0) return;
    // Förkolla att användaren har en egen nyckel innan hela batchen körs — annars
    // skulle varje kort fela var för sig. Visa istället en tydlig prompt.
    if (!(await hasOcrKey())) {
      setKeyError(OCR_NO_KEY_MESSAGE);
      return;
    }
    setKeyError('');
    setPhase('scanning');

    // Markera alla som "scanning"
    setItems(prev => prev.map(i => ({ ...i, status: 'scanning' as const })));

    // Kör alla parallellt — uppdatera varje kort när det är klart
    await Promise.allSettled(
      items.map(async item => {
        try {
          const data = await scanReceipt(item.file);
          setItems(prev => prev.map(i => {
            if (i.id !== item.id) return i;
            return {
              ...i,
              status: 'done',
              data,
              draft: makeDraft({
                date:        data.date ?? format(new Date(), 'yyyy-MM-dd'),
                description: data.vendor ?? '',
                gross:       data.amount ?? 0,
                vatRate:     data.vatRate ?? 25,
                vatDir:      data.vatDir ?? 'in',
                accountId:   (data.vatDir === 'out') ? DEFAULT_REVENUE_ACCOUNT : DEFAULT_EXPENSE_ACCOUNT,
              }),
            };
          }));
        } catch (e) {
          setItems(prev => prev.map(i =>
            i.id === item.id
              ? { ...i, status: 'error', errorMsg: (e as Error).message }
              : i,
          ));
        }
      }),
    );

    setPhase('reviewing');
  };

  const handleChange = (id: string, patch: Partial<VoucherDraft>) => {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, draft: { ...i.draft, ...patch } } : i,
    ));
  };

  const handleToggle = (id: string) => {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, selected: !i.selected } : i,
    ));
  };

  const handleBooked = (count: number) => {
    setBookedCount(count);
    setPhase('done');
  };

  const reset = () => {
    items.forEach(i => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setBookedCount(0);
    setPhase('capturing');
  };

  // ── Scanning progress overlay ────────────────────────────────────────────
  if (phase === 'scanning') {
    const done    = items.filter(i => i.status === 'done' || i.status === 'error').length;
    const total   = items.length;
    const pct     = total > 0 ? Math.round(done / total * 100) : 0;

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Skannar kvitton…</h2>
          <p className="mt-1 text-sm text-slate-500">{done} av {total} klara</p>
        </div>
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Mini grid showing progress */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {items.map(item => (
            <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
              <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
              <div className={`absolute inset-0 flex items-center justify-center ${
                item.status === 'done'     ? 'bg-emerald-500/40' :
                item.status === 'error'    ? 'bg-red-500/40' :
                item.status === 'scanning' ? 'bg-black/30' : 'bg-black/50'
              }`}>
                {item.status === 'done'  && <CheckCircle className="h-5 w-5 text-white" />}
                {item.status === 'error' && <span className="text-white text-xs font-bold">!</span>}
                {item.status === 'scanning' && (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-center text-slate-400">
          Analyserar bilderna med Gemini Vision — tar ca {Math.ceil(items.length * 3)} sekunder
        </p>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const errors = items.filter(i => i.status === 'error').length;
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
        <div className="rounded-full bg-emerald-100 p-5">
          <CheckCircle className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {bookedCount} verifikat bokförda
          </h2>
          {errors > 0 && (
            <p className="mt-1 text-sm text-amber-600">{errors} kvitto{errors !== 1 ? 'n' : ''} kunde inte tolkas och hoppades över</p>
          )}
          <p className="mt-1 text-sm text-slate-500">Originalkvittona är bifogade som bilagor</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Skanna fler
          </button>
          <button
            onClick={reset}
            className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Klar
          </button>
        </div>
      </div>
    );
  }

  // ── Capture / Review ─────────────────────────────────────────────────────
  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-xs font-medium">
        <span className={`flex items-center gap-1.5 ${phase === 'capturing' ? 'text-slate-900' : 'text-slate-400'}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            phase === 'capturing' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
          }`}>1</span>
          Fotografera
        </span>
        <span className="text-slate-300">→</span>
        <span className={`flex items-center gap-1.5 ${phase === 'reviewing' ? 'text-slate-900' : 'text-slate-400'}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            phase === 'reviewing' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
          }`}>2</span>
          Granska
        </span>
        <span className="text-slate-300">→</span>
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold bg-slate-200 text-slate-500">3</span>
          Bokför
        </span>
      </div>

      {phase === 'capturing' && (
        <>
          {keyError && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {keyError}
            </div>
          )}
          <CaptureGrid
            items={items}
            onAddFiles={addFiles}
            onRemove={removeItem}
            onScan={startScanning}
          />
        </>
      )}
      {phase === 'reviewing' && (
        <ReviewList
          items={items}
          accounts={accounts}
          onChange={handleChange}
          onToggle={handleToggle}
          onBooked={handleBooked}
        />
      )}
    </div>
  );
}
