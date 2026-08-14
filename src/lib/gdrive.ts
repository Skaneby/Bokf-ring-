// Google Drive sync — lagrar bokföringen i användarens AppData-mapp på Drive.
// Kräver att VITE_GOOGLE_CLIENT_ID är satt (se README och Google Cloud Console).
//
// Så här sätter du upp Google OAuth-klient:
//   1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
//   2. Application type: Web application
//   3. Authorized JavaScript origins: https://skaneby.github.io  (+ http://localhost:5173 för dev)
//   4. Kopiera Client ID → GitHub Secrets → GOOGLE_CLIENT_ID
//   5. Aktivera "Google Drive API" under APIs & Services → Library

import { buildBackupData, applyBackupData, BackupData } from './backup';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'bokforing.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface DriveState {
  configured: boolean;
  signedIn: boolean;
  status: SyncStatus;
  lastSync: Date | null;
  error: string | null;
  userEmail: string | null;
}

type Listener = (s: DriveState) => void;

// ── Intern state ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiry = 0;
let userEmail: string | null = null;
let status: SyncStatus = 'idle';
let lastSync: Date | null = null;
let errorMsg: string | null = null;
let listeners: Listener[] = [];
let pushTimer: ReturnType<typeof setTimeout> | null = null;
// Förhindrar att pull → DB-ändring → push triggar en onödig upload
let suppressNextPush = false;

// Queue av promises som väntar på att inloggningen ska slutföras
let pendingSignIns: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

function notify() {
  const s = getState();
  listeners.forEach(l => l(s));
}

export function getState(): DriveState {
  return {
    configured: !!CLIENT_ID,
    signedIn: !!accessToken && Date.now() < tokenExpiry,
    status,
    lastSync,
    error: errorMsg,
    userEmail,
  };
}

export function isConfigured(): boolean {
  return !!CLIENT_ID;
}

export function subscribe(listener: Listener): () => void {
  listeners = [...listeners, listener];
  listener(getState());
  return () => { listeners = listeners.filter(l => l !== listener); };
}

// ── Google Identity Services ────────────────────────────────────────────────

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.accounts?.oauth2?.initTokenClient) return resolve();
    if (document.getElementById('gis-script')) {
      document.getElementById('gis-script')!.addEventListener('load', () => resolve());
      document.getElementById('gis-script')!.addEventListener('error', () => reject(new Error('GIS-laddning misslyckades')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'gis-script';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Kunde inte ladda Google Identity Services'));
    document.head.appendChild(s);
  });
}

async function getTokenClient() {
  if (tokenClient) return tokenClient;
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID är inte konfigurerat');
  await loadGIS();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (resp: any) => {
      if (resp.error) {
        const err = new Error(resp.error_description ?? resp.error);
        errorMsg = err.message;
        status = 'error';
        pendingSignIns.forEach(p => p.reject(err));
        pendingSignIns = [];
        notify();
        return;
      }
      accessToken = resp.access_token as string;
      tokenExpiry = Date.now() + ((resp.expires_in as number) ?? 3600) * 1000;
      errorMsg = null;
      // Hämta e-postadressen via tokeninfo
      fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(r => r.json()).then((info: any) => { userEmail = info.email ?? null; })
        .catch(() => {})
        .finally(() => {
          pendingSignIns.forEach(p => p.resolve());
          pendingSignIns = [];
          notify();
        });
    },
  });
  return tokenClient;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function signIn(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google Drive ej konfigurerat');
  if (accessToken && Date.now() < tokenExpiry) return;
  const client = await getTokenClient();
  return new Promise((resolve, reject) => {
    pendingSignIns.push({ resolve, reject });
    client.requestAccessToken({ prompt: '' });
  });
}

export async function signOut(): Promise<void> {
  if (accessToken) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).google?.accounts?.oauth2?.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiry = 0;
  userEmail = null;
  errorMsg = null;
  status = 'idle';
  notify();
}

// ── Drive REST ──────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function findFile(): Promise<string | null> {
  const r = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D'${FILE_NAME}'&fields=files(id)`,
    { headers: authHeader() },
  );
  if (!r.ok) throw new Error(`Drive-sökning misslyckades: ${r.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await r.json();
  return (json.files?.[0]?.id as string) ?? null;
}

async function uploadContent(content: string, existingId?: string | null): Promise<void> {
  const metadata = existingId
    ? { name: FILE_NAME }
    : { name: FILE_NAME, parents: ['appDataFolder'] };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  body.append('file', new Blob([content], { type: 'application/json' }));
  const url = existingId
    ? `${UPLOAD_API}/files/${existingId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  const r = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: authHeader(),
    body,
  });
  if (!r.ok) throw new Error(`Drive-uppladdning misslyckades: ${r.status}`);
}

async function downloadContent(fileId: string): Promise<string> {
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: authHeader() });
  if (!r.ok) throw new Error(`Drive-nedladdning misslyckades: ${r.status}`);
  return r.text();
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Laddar upp aktuell bokföring till Drive. */
export async function push(): Promise<void> {
  if (!accessToken || Date.now() >= tokenExpiry) {
    errorMsg = 'Inte inloggad på Google Drive';
    status = 'error';
    notify();
    return;
  }
  if (suppressNextPush) { suppressNextPush = false; return; }
  status = 'syncing';
  errorMsg = null;
  notify();
  try {
    const data = await buildBackupData();
    const json = JSON.stringify(data, null, 2);
    const existingId = await findFile();
    await uploadContent(json, existingId);
    lastSync = new Date();
    status = 'idle';
  } catch (e) {
    status = 'error';
    errorMsg = e instanceof Error ? e.message : 'Synkfel vid uppladdning';
  }
  notify();
}

/** Hämtar bokföringen från Drive och returnerar rådata (utan att skriva till DB). */
export async function pullRaw(): Promise<BackupData> {
  if (!accessToken || Date.now() >= tokenExpiry) throw new Error('Inte inloggad på Google Drive');
  status = 'syncing';
  errorMsg = null;
  notify();
  try {
    const fileId = await findFile();
    if (!fileId) throw new Error('Ingen bokföring hittad på Google Drive');
    const json = await downloadContent(fileId);
    const data: BackupData = JSON.parse(json);
    lastSync = new Date();
    status = 'idle';
    notify();
    return data;
  } catch (e) {
    status = 'error';
    errorMsg = e instanceof Error ? e.message : 'Synkfel vid nedladdning';
    notify();
    throw e;
  }
}

/** Hämtar bokföringen från Drive och skriver till databasen. */
export async function pull(): Promise<void> {
  suppressNextPush = true;
  const data = await pullRaw();
  await applyBackupData(data);
}

/** Logga in + hämta data (används från Välkommen-skärmen). */
export async function signInAndPull(): Promise<BackupData> {
  await signIn();
  return pullRaw();
}

/** Schemalägg en debounced push efter DB-ändringar. */
export function schedulePush(delayMs = 60_000): void {
  if (!accessToken || Date.now() >= tokenExpiry) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { push(); pushTimer = null; }, delayMs);
}
