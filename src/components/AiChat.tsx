import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  AiSettings, getAiSettings, saveAiSettings, hasValidKey, gateMessage,
  validateApiKey, buildSystemPrompt, askAi, ChatMsg,
} from '../lib/ai';
import { taxYearsAvailable } from '../lib/declaration';
import { Sparkles, Send, Settings, CheckCircle, Loader2 } from 'lucide-react';

const SUGGESTIONS = [
  'Hur bokför jag ett inköp med 25 % moms?',
  'Vad är skillnaden mellan fakturametoden och kontantmetoden?',
  'Hur fungerar egenavgifter och var i appen hanterar jag dem?',
  'Hur exporterar jag min deklaration som SRU-filer?',
];

export function AiChat() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray()) ?? [];
  const voucherCount = useLiveQuery(() => db.vouchers.count()) ?? 0;
  const invoiceCount = useLiveQuery(() => db.invoices.count()) ?? 0;
  const vouchers = useLiveQuery(() => db.vouchers.toArray()) ?? [];

  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAiSettings().then(s => {
      setSettings(s);
      setKeyInput(s.apiKey);
      if (!hasValidKey(s)) setShowSettings(true);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  if (!settings) return <div className="text-sm text-slate-400">Laddar…</div>;

  const keyOk = hasValidKey(settings);

  const handleValidate = async () => {
    setValidating(true);
    setKeyMsg(null);
    const result = await validateApiKey(keyInput);
    if (result.ok) {
      const next: AiSettings = { apiKey: keyInput.trim(), validatedAt: new Date().toISOString().slice(0, 10) };
      await saveAiSettings(next);
      setSettings(next);
      setKeyMsg({ ok: true, text: 'Nyckeln fungerar och är sparad ✓' });
      setShowSettings(false);
    } else {
      setKeyMsg({ ok: false, text: result.error ?? 'Valideringen misslyckades.' });
    }
    setValidating(false);
  };

  const handleRemoveKey = async () => {
    const next: AiSettings = { apiKey: '' };
    await saveAiSettings(next);
    setSettings(next);
    setKeyInput('');
    setKeyMsg(null);
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    setInput('');

    // Utan validerad nyckel svarar boten själv med instruktionen
    const gate = gateMessage(settings);
    if (gate) {
      setMessages(m => [...m, { role: 'user', text: question }, { role: 'model', text: gate }]);
      setShowSettings(true);
      return;
    }

    setMessages(m => [...m, { role: 'user', text: question }]);
    setSending(true);
    try {
      const system = buildSystemPrompt({
        accounts, voucherCount, invoiceCount,
        years: taxYearsAvailable(vouchers),
      });
      const reply = await askAi(settings.apiKey, system, messages, question);
      setMessages(m => [...m, { role: 'model', text: reply }]);
    } catch {
      setMessages(m => [...m, {
        role: 'model',
        text: 'Något gick fel vid anropet till Gemini. Kontrollera internetanslutningen — eller validera nyckeln igen under kugghjulet.',
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-slate-400" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">AI-hjälp</h1>
            <p className="text-sm text-slate-500">Skatt, juridik, bokföring — och hur appen fungerar</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          aria-label="AI-inställningar"
          className={`rounded-lg p-2.5 transition-colors ${
            keyOk ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Nyckelinställningar */}
      {showSettings && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Din Gemini API-nyckel
          </p>
          <p className="text-sm text-slate-500">
            AI-hjälpen kräver din egen nyckel. Hämta en gratis på{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
               className="text-slate-900 underline">aistudio.google.com/apikey</a>.
            Nyckeln sparas <strong>enbart lokalt i din webbläsare</strong> och valideras
            med ett testanrop innan den godkänns.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setKeyMsg(null); }}
              placeholder="AIza…"
              aria-label="Gemini API-nyckel"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              onClick={handleValidate}
              disabled={validating || !keyInput.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {validating ? 'Validerar…' : 'Validera och spara'}
            </button>
            {keyOk && (
              <button
                onClick={handleRemoveKey}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Ta bort nyckel
              </button>
            )}
          </div>
          {keyMsg && (
            <p className={`text-sm ${keyMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{keyMsg.text}</p>
          )}
          {keyOk && !keyMsg && (
            <p className="text-sm text-emerald-600">Nyckel validerad {settings.validatedAt} ✓</p>
          )}
        </div>
      )}

      {/* Konversation */}
      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 min-h-[16rem]">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Ställ en fråga om bokföring, moms, skatt, deklaration — eller om hur du gör något i appen.
              {!keyOk && ' (Lägg först in din API-nyckel under kugghjulet.)'}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-900 hover:text-slate-900 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-800'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Inmatning */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(input); }}
            placeholder="Skriv din fråga…"
            aria-label="Fråga till AI-hjälpen"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            aria-label="Skicka"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400">
          AI-svaren är generell vägledning — inte professionell skatte- eller juridisk rådgivning.
          Kontrollera viktiga beslut med Skatteverket eller en rådgivare.
        </p>
      </div>
    </div>
  );
}
