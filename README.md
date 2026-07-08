# Lokal Bokföring

Ett komplett bokföringsprogram för svenska enskilda firmor — helt i webbläsaren. All data lagras lokalt (IndexedDB), ingen backend, inga konton, ingen prenumeration.

**Live:** https://skaneby.github.io/Bokf-ring-/

## Funktioner

- **Dubbelbokföring** med automatisk balansvalidering (debet = kredit, alltid)
- **BAS-kontoplan** med 25 standardkonton, fullt redigerbar
- **Momshjälp** — ange bruttobelopp och momssats (6/12/25 %), raderna fylls i automatiskt
- **OCR-skanning** — fota ett kvitto, Gemini Vision läser datum, belopp, moms och leverantör; bilden sparas automatiskt som bilaga
- **Kvittobilagor** — bifoga bilder/PDF:er till verifikat, öppna dem från huvudboken; följer med i backupen
- **Gemini-import** — klistra in JSON från en Gemini Gem och bokför flera verifikationer i ett svep, med kontoförslag från AI, ordbok och bokföringshistorik
- **Fakturering** — skapa fakturor med löpande nummerserie (obruten enligt bokföringslagen), egen HTML-mall eller standardmall, skriv ut/PDF, dela eller maila; bokförs enligt faktura- eller kontantmetoden
- **Snabbval** — eget uttag, egen insättning, F-skatt och egenavgifter med ett klick
- **Rapporter** — resultaträkning, balansräkning, huvudbok (sök + paginering), momsrapport — allt filtrerbart per år/kvartal/månad
- **Skatt & deklaration** — NE-bilagan (SKV 2161) sammanställs automatiskt, egenavgifter beräknas per åldersgrupp, momsdeklarationens rutor summeras, årsavslut med ett klick
- **SIE4** — import och export för utbyte med Fortnox, Visma och redovisningsbyråer
- **JSON-backup** — ladda ned och återställ hela bokföringen som en fil
- **AI-hjälp** — inbyggd chattbot som kan svensk skatt, juridik och bokföring och känner din kontoplan; kräver din egen (gratis) Gemini-nyckel som valideras och lagras lokalt
- **Onboarding** — pedagogisk 8-stegsguide vid första start, alltid tillgänglig via "Visa guiden"
- **PWA** — installeras på hemskärmen, uppdateras automatiskt
- **Deklaration via fil** *(beta)* — NE-bilagan (enskild firma) och INK2R/INK2S (aktiebolag) exporteras som SRU-filer (INFO.SRU + BLANKETTER.SRU) med inlämningsguide; fältkoder för NE och INK2R verifierade mot BAS kopplingstabeller

## Kom igång lokalt

Kräver Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:3000/
```

För OCR-skanning: skapa `.env` med `GEMINI_API_KEY=<din nyckel>` (hämtas på https://aistudio.google.com/apikey). Appen fungerar utan nyckel — bara skanningen inaktiveras.

## Utveckling

```bash
npm run test          # 484 enhetstester (tsx + fake-indexeddb)
npm run test:e2e      # E2E i webbläsare: desktop 1280px + mobil 375px (Playwright)
npm run lint          # typkontroll (tsc --noEmit)
npm run build         # produktionsbygge till dist/
```

## Deployment

Push till `main` triggar GitHub Actions som bygger och deployar till GitHub Pages (~40 sekunder). Ingen manuell hantering — se `.github/workflows/deploy.yml`.

## Teknikstack

| | |
|---|---|
| UI | React 19 + TypeScript + Tailwind CSS v4 |
| Bygge | Vite 6 + vite-plugin-pwa |
| Lagring | Dexie.js (IndexedDB) — allt stannar i din webbläsare |
| AI | @google/generative-ai (Gemini 2.5 Flash) |
| Datum | date-fns med svensk locale |

## Dataintegritet

All bokföringsdata lagras enbart i din webbläsares IndexedDB. Ingenting skickas till någon server (undantag: kvittobilder skickas till Google Gemini API vid OCR-skanning, om du valt att använda funktionen). Ta regelbunden JSON-backup — webbläsardata kan raderas av dig själv eller systemet.
