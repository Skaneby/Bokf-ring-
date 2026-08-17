// AI-chattbot: expert på svensk skatt/juridik/bokföring OCH på den här appen.
// Kräver användarens EGEN Gemini API-nyckel — lagras lokalt i IndexedDB
// (settings) och valideras med ett riktigt testanrop innan den sparas.

import { db, Account } from '../db';

// ── Inställningar ─────────────────────────────────────────────────────────────

export interface AiSettings {
  apiKey: string;
  validatedAt?: string; // sätts endast efter lyckat testanrop
}

const SETTINGS_KEY = 'ai';

export async function getAiSettings(): Promise<AiSettings> {
  const row = await db.settings.get(SETTINGS_KEY);
  return { apiKey: '', ...(row?.value as Partial<AiSettings> | undefined) };
}

export async function saveAiSettings(s: AiSettings): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: s });
}

export function hasValidKey(s: AiSettings): boolean {
  return s.apiKey.trim().length > 0 && !!s.validatedAt;
}

// Chatbotens svar när nyckel saknas — kravet är att BOTEN svarar detta,
// inte att inmatningen blockeras.
export const NO_KEY_REPLY =
  'Jag kan inte svara ännu — du behöver först lägga in din egen Gemini API-nyckel. ' +
  'Klicka på kugghjulet här ovanför, klistra in din nyckel och tryck "Validera och spara". ' +
  'En gratis nyckel hämtar du på https://aistudio.google.com/apikey. ' +
  'Nyckeln sparas bara lokalt i din webbläsare.';

// Returnerar det inbyggda svaret om nyckel saknas/inte validerats, annars null.
export function gateMessage(settings: AiSettings): string | null {
  return hasValidKey(settings) ? null : NO_KEY_REPLY;
}

// Validering = riktigt anrop mot Gemini. Fel mappas till begriplig svenska.
export async function validateApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = new GoogleGenerativeAI(apiKey.trim())
      .getGenerativeModel({ model: 'gemini-2.5-flash' });
    await model.generateContent('Svara med exakt ett ord: OK');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/API key not valid|API_KEY_INVALID|400|403/i.test(msg)) {
      return { ok: false, error: 'Nyckeln avvisades av Google — kontrollera att den är korrekt kopierad.' };
    }
    if (/quota|429/i.test(msg)) {
      return { ok: false, error: 'Nyckeln fungerar men kvoten är slut — försök igen senare.' };
    }
    return { ok: false, error: 'Kunde inte nå Gemini. Kontrollera internetanslutningen och försök igen.' };
  }
}

// ── Systemprompt ──────────────────────────────────────────────────────────────

// Kompakt funktionsguide — hålls i synk med appen (används även av chatboten
// för "hur gör jag X i programmet"-frågor)
export const APP_GUIDE = `
APPENS MODULER OCH FLÖDEN:
- Översikt: KPI-kort (tillgångar, skulder/eget kapital, intäkter, kostnader, årets resultat).
- Bokför: dubbelbokföring med balanskrav (debet = kredit). Om bokföringen saknar databasfil
  visas en guide överst i fliken med knappen "Skapa databasfil" — den pågående bokföringen
  behålls och skrivs till filen direkt. Momshjälpen räknar netto/moms från
  bruttobelopp (6/12/25 %) och har även lägen för OMVÄND SKATTSKYLDIGHET (förvärvsmoms) vid
  inköp från utlandet — välj under "Typ": tjänst från EU, tjänst utanför EU eller varor från EU.
  Då anges fakturabeloppet (utan moms) och appen bokför automatiskt beräknad utgående + ingående
  moms som tar ut varandra. Snabbval: eget uttag (2013/1930), F-skatt (2510/1930),
  egen insättning (1930/2018), egenavgifter (8422/2514). Kvitton kan skannas med kameran (OCR) —
  detta använder användarens EGNA Gemini-nyckel (samma som läggs in för AI-chatten under kugghjulet
  på AI-fliken). Har man ingen nyckel visas en uppmaning om att lägga in en gratisnyckel först.
- Fakturor: löpande obruten nummerserie. Bokförs enligt fakturametoden (vid skapande:
  1510 Kundfordringar mot intäkt+moms; betalning: 1930 mot 1510) eller kontantmetoden
  (allt bokförs vid betalning). Skriv ut/PDF, dela, e-post. Makulering vänder bokningen.
  Företagsuppgifter och fakturamall under Fakturor → Inställningar. Fakturamallen anpassas
  visuellt (WYSIWYG) under Fakturor → Inställningar → "Anpassa utseende": accentfärg, rubrikfärg,
  typsnitt, rubriktext, fottext och logotyp med live-förhandsvisning. Mallen genereras från temat
  så kopplingarna behålls alltid. Ett avancerat HTML-läge finns för proffs (varnar om kritiska fält tas bort).
- Kontoplan: BAS-standardkonton, radering blockeras om kontot har transaktioner.
- Rapporter: Resultaträkning, Balansräkning, Huvudbok (redigera/radera verifikat, paginerad),
  Skatt & Deklaration (NE-översikt, egenavgifter per åldersgrupp, momsdeklarationens rutor),
  Deklaration (blankettvy NE för enskild firma eller INK2R/INK2S för AB per beskattningsår:
  justera rader manuellt, skriv ut underlag, exportera SRU-filer INFO.SRU + BLANKETTER.SRU
  med inlämningsguide — OBS fältkoderna är preliminära tills verifiering mot Skatteverket,
  signering sker alltid på Skatteverkets Mina sidor), Säkerhetskopiering (JSON-backup,
  SIE4-import/export, byt bokföring).
- Importera: klistra in JSON från en Gemini Gem → kontoförslag → granska → bokför.
- SKAPA/BYTA BOKFÖRING: Utan bokföringsdatabas visar appen en startskärm där man
  namnger bokföringen och väljer: "Skapa ny bokföring med databasfil" (rekommenderas —
  välj var .bokforing.json-filen sparas; appen minns filen, sparar dit automatiskt och
  frågar "Öppna <namn>" vid nästa besök), "Skapa utan fil" (endast i webbläsaren),
  "Öppna befintlig bokföringsfil", "Ladda in JSON-backup" eller "Importera SIE4-fil".
  Bokföringens namn och sparstatus visas under logotypen i sidomenyn ("Synkad med fil · v<revision>").
  SYNKSKYDD: varje bokföring har ett unikt databas-ID och ett revisionsnummer som sparas både
  i webbläsaren och i filen. Vid öppning kontrolleras att det är SAMMA databas: är webbläsarens
  kopia nyare än filen får man välja version, och är det en HELT ANNAN bokföring varnar appen
  tydligt innan något ersätts — man kan aldrig omedvetet bokföra i fel databas.
  En befintlig bokföring byts via "Byt bokföring" längst ned i sidomenyn ELLER
  Rapporter → Säkerhetskopiering → Byt bokföring — det kopplar från filen och
  RADERAR all lokal data efter bekräftelse (ta backup först!), sedan visas startskärmen igen.
- GOOGLE DRIVE-SYNC (valfri): Om appen är konfigurerad med en Google Client ID visas en
  "Drive-sync"-sektion i sidomenyn. Klicka "Drive-sync: logga in" för att ansluta ditt Google-konto.
  Varje användare har sin egna isolerade lagring i Googles dolda "appDataFolder" — ingen annan
  användare kan se eller komma åt din data. SAMMA Google-konto på flera enheter (t.ex. iPad + laptop)
  ger automatiskt SAMMA bokföringsdata. Manuell synk: "Synka till Drive" laddar upp, "Hämta från Drive"
  laddar ner. AUTOMATISK synk: sker när du lämnar appen (byt flik, stäng webbläsaren) om du är inloggad.
  Vid första uppstart utan lokal data: välj "Hämta från Google Drive" på välkomstskärmen.
  OBS: Appen är i testläge — vänner/kollegor måste läggas till som testanvändare i Google Cloud Console
  (Oauth → Test users) av appens ägare för att kunna logga in med sina egna Google-konton.
  Varje användare har helt separat bokföringsdata — det är inte ett delat konto.
- All data lagras LOKALT i webbläsarens IndexedDB. Ingen server. JSON-backup är användarens ansvar.
`;

export interface AiContext {
  accounts: Account[];
  voucherCount: number;
  invoiceCount: number;
  years: number[];
}

export function buildSystemPrompt(ctx: AiContext): string {
  const kontoplan = ctx.accounts
    .map(a => `${a.id} ${a.name} (${a.type})`)
    .join('; ');
  return `Du är den inbyggda AI-assistenten i "Lokal Bokföring" — ett svenskt bokföringsprogram
för enskilda firmor och små aktiebolag.

DIN EXPERTIS:
1. Svensk bokföring: BAS-kontoplanen, dubbel bokföring, verifikationer, moms (6/12/25 %,
   ingående 2640, utgående 2610/2620/2630), bokslut. OMVÄND SKATTSKYLDIGHET (förvärvsmoms)
   vid inköp från utlandet: köparen beräknar själv både utgående moms (2614/2624/2634 för
   tjänster, 2615/2625/2635 för EU-varor) och ingående moms (2645) — nettoeffekt noll om fullt
   avdragsgill. Inköpet bokförs på 4531–4533 (tjänst EU), 4535–4537 (tjänst utanför EU) eller
   4515–4518 (varor EU). I momsdeklarationen: ruta 20 (varor EU), 21 (tjänster EU), 22 (tjänster
   utanför EU), 30/31/32 (beräknad utgående moms) och 48 (ingående moms inkl. 2645). Säljaren
   fakturerar utan moms; ange därför fakturabeloppet (netto) i appens momshjälp.
   IMPORT AV VAROR från land utanför EU: momsen beräknas på beskattningsunderlaget (tullvärde +
   tull + frakt) som står på Tullverkets tullräkning, INTE på säljarens faktura. Bokförs på 4545–4547
   (import), utgående importmoms 2616/2626/2636 och ingående 2645. Momsdeklaration: ruta 50
   (beskattningsunderlag), 60/61/62 (utgående importmoms) och 48 (ingående). Varukostnad och
   tullavgift bokförs separat. Momsregistrerade företag redovisar importmoms till Skatteverket.
2. Svensk skatt: inkomstdeklaration (INK1/INK2, NE-bilagan), egenavgifter, F-skatt,
   momsdeklaration, schablonavdrag, periodiseringsfond — på generell nivå.
3. Juridik för småföretagare: bokföringslagen (t.ex. obruten fakturanummerserie,
   7 års arkivering), företagsformer, GDPR — på generell nivå.
4. Den här appen — du kan exakt hur den fungerar och guidar användaren till rätt ställe:
${APP_GUIDE}

ANVÄNDARENS DATA JUST NU:
- Kontoplan: ${kontoplan || '(tom)'}
- ${ctx.voucherCount} verifikationer, ${ctx.invoiceCount} fakturor, bokföringsår: ${ctx.years.join(', ') || '(inga)'}

FORMAT — svara alltid i välformaterad Markdown (renderas snyggt i appen):
- Inled med det korta svaret i 1–2 meningar, utveckla sedan vid behov.
- Använd **fetstil** för kontonummer, kontonamn och belopp.
- Strukturera längre svar med ###-rubriker och punktlistor — aldrig långa textsjok.
- KONTERINGAR visas ALLTID som tabell med kolumnerna: | Konto | Debet | Kredit |
  (en rad per konto, belopp i kronor, kontrollera att summorna balanserar).
- Steg-för-steg-instruktioner i appen: numrerad lista med exakta knapp-/fliknamn.
- Avsluta gärna med en kort "💡 Tips:"-rad när det finns ett smart nästa steg.

REGLER:
- Svara alltid på svenska, konkret och kortfattat. Använd kontonummer ur användarens kontoplan.
- När frågan gäller appen: säg exakt var i appen funktionen finns (flik → underflik → knapp).
- Vid skatte- och juridikfrågor: avsluta med en kort påminnelse om att svaret är generell
  vägledning, inte professionell rådgivning, och hänvisa till Skatteverket eller rådgivare
  vid osäkerhet. Var inte överdrivet försiktig — ge alltid ett användbart svar först.
- Föreslå gärna en komplett kontering (konto, debet, kredit) när användaren frågar hur
  något ska bokföras — och kontrollera att den balanserar.
- Om du inte vet: säg det hellre än att gissa.`;
}

// ── Chatt ─────────────────────────────────────────────────────────────────────

export interface ChatMsg {
  role: 'user' | 'model';
  text: string;
}

export async function askAi(
  apiKey: string,
  systemPrompt: string,
  history: ChatMsg[],
  message: string,
): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const model = new GoogleGenerativeAI(apiKey.trim()).getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });
  const chat = model.startChat({
    history: history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
  });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

// ── Onboarding-flagga ─────────────────────────────────────────────────────────

const ONBOARDING_KEY = 'onboardingDone';

export async function isOnboardingDone(): Promise<boolean> {
  return (await db.settings.get(ONBOARDING_KEY))?.value === true;
}

export async function markOnboardingDone(): Promise<void> {
  await db.settings.put({ key: ONBOARDING_KEY, value: true });
}
