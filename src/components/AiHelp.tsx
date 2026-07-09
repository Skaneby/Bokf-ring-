import React, { createContext, useContext } from 'react';
import { Sparkles } from 'lucide-react';

// Kontextuell AI-hjälp: en komponent (t.ex. en hjälpruta) kan öppna AI-chatten
// och automatiskt ställa en fråga som talar om VAR i appen användaren är och vad
// hen håller på med. AI:n får därmed fokus på rätt område direkt. openHelp sätts
// av App (byter till AI-fliken + skickar frågan); default är en no-op så att
// komponenter kan renderas även utanför providern (t.ex. i tester).
export interface AiHelpApi {
  openHelp: (seed: string) => void;
}

const AiHelpContext = createContext<AiHelpApi>({ openHelp: () => {} });
export const AiHelpProvider = AiHelpContext.Provider;
export const useAiHelp = () => useContext(AiHelpContext);

// Pedagogisk knapp som startar AI-chatten fokuserad på ett område.
export function HelpButton({
  seed,
  label = 'Fråga AI om detta',
  className = '',
}: {
  seed: string;
  label?: string;
  className?: string;
}) {
  const { openHelp } = useAiHelp();
  return (
    <button
      type="button"
      onClick={() => openHelp(seed)}
      className={`inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors ${className}`}
    >
      <Sparkles className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
