import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Återhämtning från förlegad service worker som servar borttagna JS-chunkar
// (typiskt symptom: vit skärm på en enhet där PWA:n cachat en gammal version,
// t.ex. iPad/Safari, medan andra enheter ser den nya). Rensar SW + cache och
// laddar om EN gång; sessionStorage-flaggan hindrar omladdningsloop.
const CHUNK_RE = /dynamically imported module|importing a module script failed|failed to fetch dynamically|ChunkLoadError|Load failed|error loading|module script/i;
function recoverFromStaleCache(msg: string) {
  if (!CHUNK_RE.test(msg)) return;
  try { if (sessionStorage.getItem('stale-reload')) return; sessionStorage.setItem('stale-reload', '1'); } catch { return; }
  (async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch { /* fortsätt ändå med omladdning */ }
    location.reload();
  })();
}
window.addEventListener('error', e => recoverFromStaleCache(String((e as ErrorEvent).message || '')));
window.addEventListener('unhandledrejection', e => {
  const r = (e as PromiseRejectionEvent).reason;
  recoverFromStaleCache(String((r && (r.message || r)) || ''));
});
// Appen startade utan chunk-fel → nollställ flaggan så framtida fel kan åtgärdas
window.addEventListener('load', () => setTimeout(() => {
  try { sessionStorage.removeItem('stale-reload'); } catch { /* ignore */ }
}, 4000));

// ?reset=1 → nuke all SWs, caches, and IndexedDB, then reload clean
if (new URLSearchParams(location.search).has('reset')) {
  (async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    indexedDB.deleteDatabase('AccountingDB');
    location.replace(location.pathname);
  })();
} else {
  // On every startup: force SW to check for updates immediately.
  // If a new SW activates (controllerchange), reload to get fresh assets.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.update());
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
