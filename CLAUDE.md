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
- Jobba **enbart på `main`** — all deployment sker via GitHub Actions automatiskt

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

---

## Bokföringsdomän — vad tjänsten måste förstå

Du är en AI-tjänst som bygger och underhåller ett bokföringsprogram. Du måste förstå den underliggande bokföringslogiken på djupet — inte bara implementera UI. Nedan är de regler och begrepp som styr ALL kod du skriver i det här projektet.

### Grundprincipen: dubbelbokföring

Varje ekonomisk händelse registreras som en **verifikation** med minst ett debetbelopp och ett kreditbelopp. Regeln är absolut:

> **Summa debet = Summa kredit** — alltid, utan undantag.

Om du skriver kod som tillåter att en obalanserad verifikation sparas är det ett allvarligt fel. Balanskontrollen ska göras på de rader som faktiskt sparas (rader med valt konto), inte på alla rader i formuläret.

### Kontoarter och deras logik

Varje konto tillhör en kontoart. Kontoarten avgör hur saldot tolkas i rapporterna:

| Kontoart | Svenska | Debet ökar/minskar | Kredit ökar/minskar |
|----------|---------|-------------------|---------------------|
| `asset` | Tillgång | Ökar (+) | Minskar (−) |
| `liability` | Skuld | Minskar (−) | Ökar (+) |
| `equity` | Eget kapital | Minskar (−) | Ökar (+) |
| `revenue` | Intäkt | Minskar (−) | Ökar (+) |
| `expense` | Kostnad | Ökar (+) | Minskar (−) |

I databasen lagras alla belopp som ett signerat tal: positivt = debet, negativt = kredit. För att visa ett intäktssaldo som positivt tal i rapporterna måste du negera databassaldot (`revenue -= bal`).

### Verifikation — vad som ska bokföras

En verifikation är en ekonomisk händelse. Exempel på vanliga händelser och hur de bokförs:

**Inköp med moms (ingående moms):**
- Kostnadskonto (t.ex. 5410) Debet: nettobelopp
- 2640 Ingående moms Debet: momsbelopp
- 1930 Bank Kredit: bruttobelopp

**Försäljning med moms (utgående moms):**
- 1930 Bank Debet: bruttobelopp
- Intäktskonto (t.ex. 3000) Kredit: nettobelopp
- 2610/2620/2630 Utgående moms Kredit: momsbelopp

En bokning med bara 2 av 3 rader ovan är **alltid fel** — det är ett tecken på att kostnadskontot eller intäktskontot saknas.

### Momsberäkning

Moms beräknas alltid från bruttobeloppet (inkl. moms):

```
moms = round(brutto × sats / (100 + sats), 2 decimaler)
netto = round(brutto − moms, 2 decimaler)
```

Momssatser: 6%, 12%, 25%. Kontomappning:
- 25% utgående → 2610, 12% → 2620, 6% → 2630
- Ingående moms (alla satser) → 2640

### Huvudboken

Huvudboken är summan av alla transaktioner per konto. Det är grunden för alla rapporter — resultaträkning, balansräkning och momsrapport är olika filter på samma underliggande data. Du ska aldrig beräkna en rapport från något annat än huvudboken.

### Balansräkningsekvationen

Denna ekvation ska alltid stämma i databasen:

> **Tillgångar = Skulder + Eget kapital + Årets resultat**

Om ekvationen inte stämmer finns det ett fel i bokföringen. Testerna kontrollerar detta efter varje operation.

### Resultaträkning

- **Intäkter** = summan av kreditbokningar på intäktskonton (negerat databassaldo)
- **Kostnader** = summan av debetbokningar på kostnadskonton (databassaldo direkt)
- **Årets resultat** = Intäkter − Kostnader

### Rapporter är vyer — inte separat data

Alla rapporter (resultat, balans, huvudbok, moms) läser samma `transactions`-tabell. Det finns ingen separat "rapportdatabas". När du ändrar en verifikation uppdateras alla rapporter automatiskt via `useLiveQuery`.

## Utvecklingsflöde
```bash
npm run dev    # lokal dev
npm run build  # produktionsbygge — verifiera alltid innan push
git push origin main  # triggar deploy automatiskt
```

---

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake from recurring
- Ruthlessly iterate on lessons until mistake rate drops
- Review lessons at session start for relevant context

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it — don't ask for hand-holding
- Point at logs, errors, failing tests then resolve them
- Zero context switching required from the user
- Fix failing CI tests without being told how

---

## Task Management

1. **Plan First** — write plan to `tasks/todo.md` with checkable items
2. **Verify Plan** — check in before starting implementation
3. **Track Progress** — mark items complete as you go
4. **Explain Changes** — high-level summary at each step
5. **Document Results** — add review section to `tasks/todo.md`
6. **Capture Lessons** — update `tasks/lessons.md` after any correction

---

## Core Principles

- **Simplicity First** — make every change as simple as possible; impact minimal code
- **No Laziness** — find root causes; no temporary fixes; senior developer standards
- **Minimal Impact** — changes should only touch what's necessary; avoid introducing bugs
- **Comment on Code** — write clear, understandable comments so developers can follow the logic
