# Lokal Bokföring

Ett komplett bokföringsprogram för svenska enskilda firmor — helt i webbläsaren. All data lagras lokalt (IndexedDB), ingen backend, inga konton, ingen prenumeration.

**Live:** https://skaneby.github.io/Bokf-ring-/

## Funktioner

- **Dubbelbokföring** med automatisk balansvalidering (debet = kredit, alltid)
- **BAS-kontoplan** med 25 standardkonton, fullt redigerbar
- **Momshjälp** — ange bruttobelopp och momssats (6/12/25 %), raderna fylls i automatiskt
- **OCR-skanning** — fota ett kvitto, Gemini Vision läser datum, belopp, moms och leverantör
- **Gemini-import** — klistra in JSON från en Gemini Gem och bokför flera verifikationer i ett svep, med kontoförslag från AI, ordbok och bokföringshistorik
- **Fakturering** — skapa fakturor med löpande nummerserie (obruten enligt bokföringslagen), egen HTML-mall eller standardmall, skriv ut/PDF, dela eller maila; bokförs enligt faktura- eller kontantmetoden
- **Snabbval** — eget uttag, egen insättning, F-skatt och egenavgifter med ett klick
- **Rapporter** — resultaträkning, balansräkning, huvudbok (med paginering)
- **Skatt & deklaration** — NE-bilagan (SKV 2161) sammanställs automatiskt, egenavgifter beräknas per åldersgrupp, momsdeklarationens rutor summeras
- **SIE4** — import och export för utbyte med Fortnox, Visma och redovisningsbyråer
- **JSON-backup** — ladda ned och återställ hela bokföringen som en fil
- **PWA** — installeras på hemskärmen, uppdateras automatiskt
- **Deklaration via fil** *(planerad)* — SRU-export (INFO.SRU + BLANKETTER.SRU) för inlämning till Skatteverket, se `docs/deklarationsmodul-spec.md`

## Kom igång lokalt

Kräver Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:3000/
```

För OCR-skanning: skapa `.env` med `GEMINI_API_KEY=<din nyckel>` (hämtas på https://aistudio.google.com/apikey). Appen fungerar utan nyckel — bara skanningen inaktiveras.

## Utveckling

```bash
npm run test       # 325 enhetstester (tsx + fake-indexeddb)
npm run lint       # typkontroll (tsc --noEmit)
npm run build      # produktionsbygge till dist/
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
