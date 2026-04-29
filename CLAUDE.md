# Lokal Bokföring — projektöversikt

## Stack
- React 19 + TypeScript + Vite 6 + Tailwind CSS v4
- Dexie.js (IndexedDB) — all data lagras lokalt i webbläsaren, ingen backend
- @google/generative-ai (Gemini 2.5 Flash) — OCR-skanning av kvitton
- vite-plugin-pwa — PWA med auto-uppdatering via service worker
- date-fns med svenska locale

---

## Deployment

| Parameter | Värde |
|-----------|-------|
| Repo | `Skaneby/Bokf-ring-` (stort B — skiftlägeskänsligt) |
| Live URL | `https://skaneby.github.io/Bokf-ring-/` (stort B) |
| Vite base path | `/Bokf-ring-/` (måste matcha repo-namnet exakt) |
| Branch | `main` — all deployment sker härifrån |
| GitHub Pages source | **"GitHub Actions"** (inte "Deploy from branch") |

**Deployment-flöde:**
```
git push origin main
  → GitHub Actions triggas (.github/workflows/deploy.yml)
  → npm ci && npm run build
  → actions/upload-pages-artifact@v3 (dist/)
  → actions/deploy-pages@v4
  → Live på GitHub Pages (~40 sekunder)
```

**KRITISKT:** GitHub Pages MÅSTE vara konfigurerat till "GitHub Actions" som source i repo Settings → Pages. Om det är satt till "Deploy from branch" ignoreras alla Actions-deployments.

**Förbjudna branches:** `gh-pages`, `gh-pages-clean` — ska inte existera. Om de dyker upp, ta bort dem.

---

## Miljövariabler
- `GEMINI_API_KEY` läses med `process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY` i vite.config.ts
  - `process.env` — fångar GitHub Actions secrets under bygget
  - `env` (loadEnv) — fångar lokala `.env`-filer
  - OBS: `loadEnv` läser INTE systemmiljövariabler — måste använda `process.env.X ?? env.X`
- Nyckeln bäddas in i JS-bundelns vid byggtid (statisk app, ingen backend)

---

## Arkitektur
```
src/
  App.tsx              — routing, editId-state, välkomstskärm-logik, hasData-check
  db.ts                — Dexie-schema (accounts, vouchers, transactions)
  main.tsx             — React-root mount
  test.ts              — 156 enhetstester (Node + fake-indexeddb)
  components/
    Welcome.tsx        — visas vid tom DB; ladda JSON, importera SIE4, eller starta nytt
    Dashboard.tsx      — KPI-kort; använd useLiveQuery i toppen (INTE i JSX)
    VoucherEntry.tsx   — bokföringsformulär, momshjälp, OCR-skanning
    ChartOfAccounts.tsx — kontoplan CRUD
    Reports.tsx        — flikar: Resultat, Balans, Huvudbok, Säkerhetskopiering + Byt bokföring
  lib/
    backup.ts          — buildBackupData() / applyBackupData() / exportBackup()
    sie.ts             — exportSIE() / importSIE(content, 'merge'|'replace')
    vat.ts             — splitVat() / vatRows() / VAT_OUT / VAT_IN — testbar logik
    ocr.ts             — scanReceipt(file) via Gemini Vision
    utils.ts           — formatCurrency()
```

---

## Kända fallgropar

### React
- **Hooks i JSX är förbjudet** — `useLiveQuery` måste anropas i toppen av komponenten, aldrig inuti return-satsen eller villkorssatser
- **useLiveQuery auto-uppdaterar** — ingen manuell refresh behövs efter DB-ändringar

### Deployment
- **Repo-namnet har stort B** — `Bokf-ring-` inte `bokf-ring-` — påverkar base path och URL
- **`loadEnv` läser inte `process.env`** — använd `process.env.X ?? env.X` för CI-secrets
- **Aldrig pusha till gh-pages manuellt** — deploy-pages@v4 hanterar allt
- **PWA service worker** — använd `registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true` — annars fastnar gamla SW och servar stale cache på användarens enhet

### Bokföring
- **Balanscheck på sparade rader** — beräkna debet/kredit-diff ENBART på rader med valt konto (samma set som sparas), inte alla formulärrader
- **SIE-import mode** — `importSIE(content, 'merge')` eller `'replace'`
- **Verifikationer** redigeras/raderas från Rapporter → Huvudbok; state lyfts via `editId` i App.tsx

---

## Bokföringsdomän

Du är en AI-tjänst som bygger och underhåller ett bokföringsprogram. Bokföringslogiken styr ALL kod du skriver.

### Grundprincipen: dubbelbokföring

> **Summa debet = Summa kredit — alltid, utan undantag.**

### Kontoarter

| Kontoart | Svenska | Debet | Kredit |
|----------|---------|-------|--------|
| `asset` | Tillgång | Ökar | Minskar |
| `liability` | Skuld | Minskar | Ökar |
| `equity` | Eget kapital | Minskar | Ökar |
| `revenue` | Intäkt | Minskar | Ökar |
| `expense` | Kostnad | Ökar | Minskar |

I databasen: positivt tal = debet, negativt tal = kredit. För att visa intäkt som positivt i rapport: negera databassaldot.

### Typiska verifikationer

**Inköp med moms:**
- Kostnadskonto (5410 etc.) Debet: netto
- 2640 Ingående moms Debet: moms
- 1930 Bank Kredit: brutto

**Försäljning med moms:**
- 1930 Bank Debet: brutto
- Intäktskonto (3000 etc.) Kredit: netto
- 2610/2620/2630 Utgående moms Kredit: moms

### Momsberäkning
```
moms  = round(brutto × sats / (100 + sats), 2)
netto = round(brutto − moms, 2)
```
Satser: 6% → 2630, 12% → 2620, 25% → 2610 (utgående). Ingående alltid 2640.

### Balansräkningsekvationen
> **Tillgångar = Skulder + Eget kapital + Årets resultat**

### Rapporter är vyer på samma data
Alla rapporter läser `transactions`-tabellen. Det finns ingen separat rapportdatabas.

---

## Utvecklingsflöde
```bash
npm run dev          # lokal dev (http://localhost:5173/)
npm run test         # kör 156 enhetstester
npm run build        # produktionsbygge — verifiera alltid innan push
git push origin main # triggar deploy automatiskt (~40 sek)
```

---

## Workflow Orchestration

### 1. Plan First
- Gå in i plan-läge för ALLA icke-triviala uppgifter (3+ steg eller arkitekturella beslut)
- Om något går fel — STOPPA och omplanera omedelbart, fortsätt inte att trycka på
- Skriv detaljerade specs i förväg för att minska tvetydighet

### 2. Subagent-strategi
- Använd subagenter liberalt för att hålla huvudkontextfönstret rent
- Delegera research, utforskning och parallell analys till subagenter
- En uppgift per subagent för fokuserad exekvering

### 3. Self-Improvement Loop
- Efter VARJE korrigering från användaren: uppdatera `tasks/lessons.md` med mönstret
- Skriv regler som förhindrar samma misstag från att återupprepas
- Granska lessons.md i början av varje session

### 4. Verifiera innan klart
- Markera ALDRIG en uppgift som klar utan att bevisa att det fungerar
- Kör tester, kolla loggar, visa korrekthet
- Fråga dig själv: "Skulle en senior ingenjör godkänna detta?"

### 5. Kräv elegans (balanserat)
- För icke-triviala ändringar: pausa och fråga "finns det ett mer elegant sätt?"
- Om en fix känns hackig: implementera den eleganta lösningen istället
- Hoppa över detta för enkla, uppenbara fixar — överkonstruera inte

### 6. Autonom buggfix
- Vid buggrapport: fixa den direkt — fråga inte om hand-holding
- Peka på loggar, fel, misslyckade tester och lös dem
- Fixa misslyckade CI-tester utan att bli tillsagd

## Arbetsregler

1. **Jobba enbart på `main`** — inga feature branches, inga gh-pages branches
2. **Bygg alltid innan push** — `npm run build` måste lyckas
3. **Kör tester** — `npm run test` ska vara grönt
4. **Verifiera deployment** — kolla GitHub Actions efter push (~40 sek)
5. **Minsta möjliga förändring** — rör bara det som behövs för uppgiften
6. **Inga kommentarer** om inte WHY är icke-uppenbar
7. **Uppdatera lessons.md** efter varje korrigering från användaren
8. **Planera i todo.md** — checklistor, markera klart vartefter

## Uppgiftshantering

1. **Planera först** — skriv plan till `tasks/todo.md` med checkbara punkter
2. **Verifiera plan** — checka in innan implementation påbörjas
3. **Spåra progress** — markera punkter klara vartefter
4. **Förklara ändringar** — hög-nivå-sammanfattning vid varje steg
5. **Dokumentera resultat** — lägg till review-sektion i `tasks/todo.md`
6. **Fånga lärdomar** — uppdatera `tasks/lessons.md` efter korrigeringar
