// Byggmetadata + tvinga-uppdatering. Version/datum injiceras av Vite (define i
// vite.config.ts) vid byggtid, så användaren kan läsa exakt vilken version som körs.

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const BUILD_DATE: string = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';

// "2026-07-17T12:42:51.000Z" → "2026-07-17 14:42" (visas i lokal tid)
export function formatBuildDate(iso: string = BUILD_DATE): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Tvinga uppdatering: avregistrera service worker + rensa alla caches och ladda
// om från nätet. Rör INTE IndexedDB — bokföringen är kvar. Används av knappen i UI:t
// när en enhet fastnat på en gammal cachad version (t.ex. iPad/Safari).
export async function forceUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* ladda om ändå */ }
  location.reload();
}
