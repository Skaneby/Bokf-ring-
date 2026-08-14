import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, CloudUpload, LogOut, Loader2 } from 'lucide-react';
import * as GDrive from '../lib/gdrive';

export function DriveSync() {
  const [state, setState] = useState<GDrive.DriveState>(GDrive.getState());

  useEffect(() => GDrive.subscribe(setState), []);

  if (!state.configured) return null;

  const handleSignIn = async () => {
    try { await GDrive.signIn(); }
    catch (e) { /* felhantering sker via subscribe */ }
  };

  const handlePull = async () => {
    try { await GDrive.pull(); }
    catch { /* errorMsg via subscribe */ }
  };

  const formatTime = (d: Date | null) => {
    if (!d) return null;
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  };

  if (!state.signedIn) {
    return (
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={handleSignIn}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <Cloud className="h-4 w-4 shrink-0" />
          Drive-sync: logga in
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-1 space-y-1">
      {/* Status-rad */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50">
        {state.status === 'syncing'
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 text-blue-400 animate-spin" />
          : state.status === 'error'
            ? <CloudOff className="h-3.5 w-3.5 shrink-0 text-red-400" />
            : <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-slate-300">
            {state.userEmail ?? 'Google Drive'}
          </p>
          <p className="text-[10px] text-slate-500">
            {state.status === 'syncing' ? 'Synkar…'
              : state.status === 'error' ? (state.error ?? 'Fel')
              : state.lastSync ? `Synkad ${formatTime(state.lastSync)}`
              : 'Inte synkad än'}
          </p>
        </div>
      </div>

      {/* Knappar */}
      <button
        onClick={() => GDrive.push()}
        disabled={state.status === 'syncing'}
        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
      >
        <CloudUpload className="h-4 w-4 shrink-0" />
        Synka till Drive
      </button>
      <button
        onClick={handlePull}
        disabled={state.status === 'syncing'}
        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
      >
        <Cloud className="h-4 w-4 shrink-0" />
        Hämta från Drive
      </button>
      <button
        onClick={GDrive.signOut}
        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Logga ut från Drive
      </button>
    </div>
  );
}
