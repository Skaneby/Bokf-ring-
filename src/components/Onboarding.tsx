import React, { useState } from 'react';
import {
  LayoutDashboard, BookOpen, Receipt, FileText, Landmark, FileJson,
  Sparkles, ShieldCheck, X, ChevronLeft, ChevronRight, LucideIcon,
} from 'lucide-react';

export interface OnboardingStep {
  icon: LucideIcon;
  title: string;
  body: string;
  tips: string[];
}

// Pedagogisk genomgång — förklarar både bokföringsbegreppet och var i appen
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: ShieldCheck,
    title: 'Välkommen till Lokal Bokföring',
    body: 'Allt du bokför sparas enbart i din webbläsare — ingen server, inga konton, ingen som läser din data. Det betyder också att DU ansvarar för säkerhetskopior.',
    tips: [
      'Ta en JSON-backup regelbundet: sidomenyn → "Ladda ned backup"',
      'Rensar du webbläsardata försvinner bokföringen — utan backup är den borta',
      'Varje bokföring har ett unikt databas-ID och versionsnummer — appen kontrollerar vid öppning att fil och webbläsare är samma databas i synk, och varnar annars',
      'Ny eller annan bokföring? "Byt bokföring" i sidomenyn raderar allt (efter bekräftelse) och tar dig till startvalet',
    ],
  },
  {
    icon: BookOpen,
    title: 'Dubbelbokföring på 30 sekunder',
    body: 'Varje händelse bokförs på minst två konton: pengarna kommer någonstans ifrån (kredit) och tar vägen någonstans (debet). Summan debet måste alltid vara lika med summan kredit — appen vägrar spara obalanserade verifikat.',
    tips: [
      'Köper du kaffe för 100 kr: kostnadskonto debet 100, bankkonto kredit 100',
      'Tillgångar ökar på debet; skulder, eget kapital och intäkter ökar på kredit',
      'Kontona följer BAS-standarden: 1xxx tillgångar, 2xxx skulder/eget kapital, 3xxx intäkter, 4xxx–7xxx kostnader',
    ],
  },
  {
    icon: LayoutDashboard,
    title: 'Bokför — din vardagsflik',
    body: 'Under "Bokför" registrerar du verifikat. Momshjälpen gör grovjobbet: ange belopp inklusive moms och momssats, så fylls raderna i automatiskt — du väljer bara kostnads- eller intäktskonto.',
    tips: [
      'Saknar bokföringen databasfil visar fliken en guide: skapa filen med ett klick så auto-sparas allt du bokför',
      'Skanna kvitton med kameran — datum, belopp och moms läses automatiskt (kräver API-nyckel)',
      'Bifoga kvittobilder eller PDF:er — de sparas med verifikatet och följer med i backupen',
      'Snabbvalen bokför eget uttag, egen insättning, F-skatt och egenavgifter med ett klick',
    ],
  },
  {
    icon: Receipt,
    title: 'Fakturor med rätt nummerserie',
    body: 'Fakturor får löpande nummer som aldrig återanvänds — det kräver bokföringslagen. Välj bokföringsmetod per faktura: fakturametoden (bokförs direkt som kundfordran) eller kontantmetoden (bokförs först vid betalning).',
    tips: [
      'Fyll i företagsuppgifter under Fakturor → Inställningar innan första fakturan',
      'Skicka som utskrift/PDF, dela-funktion eller e-post',
      'Makulera i stället för att radera — bokningen vänds automatiskt',
    ],
  },
  {
    icon: FileText,
    title: 'Rapporter — samma siffror, olika vyer',
    body: 'Resultaträkning, balansräkning och huvudbok är olika vyer på samma verifikat. I huvudboken kan du redigera och radera verifikat — allt annat räknas om automatiskt.',
    tips: [
      'Balansräkningen ska alltid balansera: tillgångar = skulder + eget kapital + årets resultat',
      'Under Säkerhetskopiering finns JSON-backup och SIE4 för byte till/från andra system',
    ],
  },
  {
    icon: Landmark,
    title: 'Skatt & deklaration',
    body: 'Fliken Skatt visar NE-underlag, egenavgifter och momsdeklarationens rutor löpande under året. Fliken Deklaration bygger blankettvyn (NE för enskild firma, INK2 för AB) per beskattningsår — justera rader, skriv ut underlag eller exportera SRU-filer för uppladdning hos Skatteverket.',
    tips: [
      'Deklarationen signeras ALLTID på Skatteverkets Mina sidor — aldrig i appen',
      'SRU-exporten är i beta: kontrollera filerna i Skatteverkets testtjänst först',
      'Bokför egenavgiftsavsättningen med ett klick under Skatt-fliken',
    ],
  },
  {
    icon: FileJson,
    title: 'Importera bokföring från AI',
    body: 'Har du en Gemini Gem som läser dina kvitton? Klistra in dess JSON under "Importera" så föreslår appen konton (via AI-förslag, ordbok och din egen historik), visar konteringen och bokför allt när du godkänt.',
    tips: [
      'Rader utan konto hoppas över — inget bokförs utan din granskning',
      'Formatreferensen finns längst ned på Importera-fliken',
    ],
  },
  {
    icon: Sparkles,
    title: 'AI-hjälpen — din bokföringsexpert',
    body: 'Under "AI-hjälp" kan du fråga om moms, kontering, skatt, juridik — och om hur appen fungerar. Assistenten känner till din kontoplan och föreslår kompletta konteringar.',
    tips: [
      'Kräver din egen (gratis) Gemini-nyckel — läggs in och valideras under kugghjulet',
      'Nyckeln sparas bara lokalt i din webbläsare',
      'AI-svar är vägledning, inte professionell rådgivning',
    ],
  },
];

interface Props {
  onClose: () => void;
}

export function Onboarding({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const s = ONBOARDING_STEPS[step];
  const Icon = s.icon;
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Guide · steg {step + 1} av {ONBOARDING_STEPS.length}
          </span>
          <button
            onClick={onClose}
            aria-label="Stäng guiden"
            className="rounded p-2 text-slate-300 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Innehåll */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-3">
              <Icon className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{s.title}</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">{s.body}</p>
          <ul className="space-y-2">
            {s.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600">
                <span className="mt-0.5 text-emerald-600">✓</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button
            onClick={() => setStep(n => Math.max(0, n - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-0 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Tillbaka
          </button>

          {/* Progress */}
          <div className="flex gap-1.5" aria-hidden>
            {ONBOARDING_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-slate-900' : 'w-1.5 bg-slate-200 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Kom igång!
            </button>
          ) : (
            <button
              onClick={() => setStep(n => n + 1)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Nästa <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
