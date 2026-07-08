// Bokföringsdatabasen som FIL — appens minne av "vilken bokföring är detta".
//
// Modell: IndexedDB är arbetskopian (snabb, reaktiv). Bokföringsfilen
// (Namn.bokforing.json på en plats användaren valt) är den beständiga
// databasen: auto-sparas vid varje ändring och läses in vid start.
// FileSystemFileHandle är strukturklonbar och sparas i settings —
// därför "minns" appen filen mellan besök (behörighet bekräftas med
// ett klick vid återbesök, det kräver webbläsaren).
//
// Fallback: utan File System Access API (Firefox/Safari) lever bokföringen
// enbart i webbläsaren, med namn, och manuell backup rekommenderas.

import { db } from '../db';
import { buildBackupData, applyBackupData } from './backup';

const META_KEY = 'bokforingsfil';

export interface BokforingsfilMeta {
  name: string;                        // bokföringens namn, t.ex. "Skaneby AB"
  handle?: FileSystemFileHandle;       // saknas i fallback-läget (utan fil)
}

export function supportsFileSystem(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export async function getBokforingsfil(): Promise<BokforingsfilMeta | null> {
  const row = await db.settings.get(META_KEY);
  return (row?.value as BokforingsfilMeta | undefined) ?? null;
}

export async function setBokforingsfil(meta: BokforingsfilMeta): Promise<void> {
  await db.settings.put({ key: META_KEY, value: meta });
}

export async function clearBokforingsfil(): Promise<void> {
  await db.settings.delete(META_KEY);
}

// ── Filoperationer ────────────────────────────────────────────────────────────

export async function pickNewFile(name: string): Promise<FileSystemFileHandle> {
  return window.showSaveFilePicker({
    suggestedName: `${name.replace(/[\\/:*?"<>|]/g, '')}.bokforing.json`,
    types: [{ description: 'Bokföringsdatabas', accept: { 'application/json': ['.json'] } }],
  });
}

export async function pickExistingFile(): Promise<FileSystemFileHandle> {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'Bokföringsdatabas', accept: { 'application/json': ['.json'] } }],
  });
  return handle;
}

// Behörighet måste bekräftas per besök — kräver användargest (knapptryck)
export async function verifyPermission(handle: FileSystemFileHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

export async function writeToFile(handle: FileSystemFileHandle, name: string): Promise<void> {
  const backup = { ...(await buildBackupData()), bokforingName: name };
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(backup));
  await writable.close();
}

export async function readFromFile(handle: FileSystemFileHandle): Promise<{ name?: string }> {
  const file = await handle.getFile();
  const data = JSON.parse(await file.text());
  await applyBackupData(data);
  return { name: data.bokforingName };
}

// ── Auto-sparning ─────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Ren, testbar debouncer: markDirty() samlar ändringar, flush() sparar direkt.
// suspend() används under inläsning (applyBackupData triggar annars hooks).
export function createAutoSaver(save: () => Promise<void>, delayMs = 2500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suspended = false;
  let status: SaveStatus = 'idle';
  const listeners = new Set<(s: SaveStatus) => void>();

  const setStatus = (s: SaveStatus) => {
    status = s;
    listeners.forEach(cb => cb(s));
  };

  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (suspended) return;
    setStatus('saving');
    try {
      await save();
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return {
    markDirty() {
      if (suspended) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    suspend() { suspended = true; if (timer) { clearTimeout(timer); timer = null; } },
    resume() { suspended = false; },
    get status() { return status; },
    subscribe(cb: (s: SaveStatus) => void) {
      listeners.add(cb);
      cb(status);
      return () => listeners.delete(cb);
    },
  };
}

export type AutoSaver = ReturnType<typeof createAutoSaver>;

// Registrerar ändringskrokar på alla datatabeller → markDirty.
// (Sparningen skriver inte till settings, så ingen loop uppstår.)
export function watchDatabase(saver: AutoSaver): void {
  const tables = [
    db.accounts, db.vouchers, db.transactions,
    db.invoices, db.declarations, db.attachments, db.settings,
  ];
  for (const table of tables) {
    table.hook('creating', () => { saver.markDirty(); });
    table.hook('updating', () => { saver.markDirty(); });
    table.hook('deleting', () => { saver.markDirty(); });
  }
}
