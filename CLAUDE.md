# Lokal Bokföring — projektöversikt

## Stack
- React 19 + TypeScript + Vite + Tailwind CSS v4
- Dexie.js (IndexedDB) — all data lagras lokalt i webbläsaren
- @google/generative-ai (Gemini Vision) — OCR-skanning av kvitton
- date-fns med svenska locale

## Deployment
- **Repo:** `Skaneby/Bokf-ring-` (publikt, stort B i namnet)
- **Live URL:** `https://skaneby.github.io/Bokf-ring-/` (stort B — skiftlägeskänsligt)
- **Vite base path:** `/Bokf-ring-/` (måste matcha repo-namnet exakt)
- **GitHub Actions** bygger och deployer vid push till `main` via `actions/deploy-pages@v4`
- **Pages source** i GitHub Settings: "GitHub Actions" (inte branch)
- Jobba **enbart på `main`** — ingen manuell hantering av `gh-pages`

## Miljövariabler
- `GEMINI_API_KEY` läses med `process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY` i vite.config.ts
  - `process.env` fångar GitHub Actions secrets under bygget
  - `env` (loadEnv) fångar lokala `.env`-filer — OBS: `loadEnv` läser INTE systemmiljövariabler
- Nyckeln bäddas in i JS-bundelns byggtid (statisk app, ingen backend)

## Arkitektur
```
src/
  App.tsx              — routing, editId-state, välkomstskärm-logik
  db.ts                — Dexie-schema (accounts, vouchers, transactions)
  components/
    Welcome.tsx        — visas vid tom DB; ladda JSON-fil eller starta nytt
    Dashboard.tsx      — KPI-kort, använd useLiveQuery i toppen (INTE i JSX)
    VoucherEntry.tsx   — bokföringsformulär, momshjälp, OCR-skanning
    ChartOfAccounts.tsx
    Reports.tsx        — flikar: Resultat, Balans, Huvudbok, Säkerhetskopiering
  lib/
    backup.ts          — exportBackup() / importBackup(file)
    sie.ts             — exportSIE() / importSIE(content, mode) — mode: merge|replace
    ocr.ts             — scanReceipt(file) via Gemini Vision
    utils.ts           — formatCurrency()
```

## Kända fallgropar
- **Hooks i JSX är förbjudet** — `useLiveQuery` måste anropas i toppen av komponenten, aldrig inuti return-satsen
- **Repo-namnet har stort B** — `Bokf-ring-` inte `bokf-ring-`, påverkar base path och GitHub Pages URL
- **`loadEnv` läser inte `process.env`** — använd `process.env.X ?? env.X` för secrets som sätts av CI
- **SIE-import mode** — `importSIE(content, 'merge')` eller `'replace'`; frågar användaren om DB inte är tom
- **Verifikationer** redigeras/raderas från Rapporter → Huvudbok; state lyfts via `editId` i App.tsx

## Viktig affärslogik
- Debet = positivt belopp, Kredit = negativt i databasen
- Momskonton: 2610 (25% utg.), 2620 (12% utg.), 2630 (6% utg.), 2640 (ing. moms)
- `useLiveQuery` — alla vyer uppdateras automatiskt när DB ändras, ingen manuell refresh behövs
- JSON-backup är primär säkerhetskopia; SIE4 för export till revisorer/andra system

## Utvecklingsflöde
```bash
npm run dev    # lokal dev
npm run build  # produktionsbygge — verifiera alltid innan push
git push origin main  # triggar deploy automatiskt
```
