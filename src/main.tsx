import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
      <App />
    </StrictMode>,
  );
}
