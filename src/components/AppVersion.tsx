import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION, formatBuildDate, forceUpdate } from '../lib/version';

// Visar körande version + byggdatum i sidomenyns fot, med en knapp som tvingar
// fram senaste versionen (rensar service worker/cache, behåller din data).
export function AppVersion() {
  const [updating, setUpdating] = useState(false);
  const built = formatBuildDate();

  const handle = async () => {
    setUpdating(true);
    await forceUpdate(); // laddar om sidan
  };

  return (
    <div className="border-t border-slate-800 px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="text-[10px] text-slate-500">
        Version <span className="font-mono text-slate-400">{APP_VERSION}</span>
      </p>
      {built && <p className="text-[10px] text-slate-600">Byggd {built}</p>}
      <button
        onClick={handle}
        disabled={updating}
        className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-white disabled:opacity-60 transition-colors"
      >
        <RefreshCw className={`h-3 w-3 ${updating ? 'animate-spin' : ''}`} />
        {updating ? 'Uppdaterar…' : 'Sök efter uppdatering'}
      </button>
    </div>
  );
}
