import React, { useRef } from 'react';
import { Camera, X, ScanLine, Loader2 } from 'lucide-react';
import type { ScanItem } from './types';

interface Props {
  items: ScanItem[];
  onAddFiles: (files: FileList) => void;
  onRemove: (id: string) => void;
  onScan: () => void;
}

export function CaptureGrid({ items, onAddFiles, onRemove, onScan }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onAddFiles(e.target.files);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Fotografera kvitton</h2>
        <p className="mt-1 text-sm text-slate-500">
          Lägg till alla kvitton du vill bokföra — tryck sedan på Skanna.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {items.map(item => (
          <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
            <img
              src={item.previewUrl}
              alt="Kvitto"
              className="h-full w-full object-cover"
            />
            {/* Remove button */}
            <button
              onClick={() => onRemove(item.id)}
              className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Ta bort"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {/* Scanning overlay */}
            {item.status === 'scanning' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              </div>
            )}
          </div>
        ))}

        {/* Add button */}
        <button
          onClick={() => inputRef.current?.click()}
          className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-colors"
        >
          <Camera className="h-6 w-6" />
          <span className="text-xs font-medium">Lägg till</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 py-12 text-center">
          <Camera className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">Inga kvitton tillagda än</p>
          <p className="text-xs text-slate-400 mt-0.5">Tryck på "Lägg till" ovan</p>
        </div>
      )}

      {/* Scan button */}
      {items.length > 0 && (
        <button
          onClick={onScan}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
        >
          <ScanLine className="h-4 w-4" />
          Skanna {items.length} kvitto{items.length !== 1 ? 'n' : ''}
        </button>
      )}
    </div>
  );
}
