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
  db.ts                — Dexie-schema v4 (accounts, vouchers, transactions, invoices, settings, declarations, attachments) + PATCH_ACCOUNTS
  main.tsx             — React-root mount, ErrorBoundary, ?reset=1-flöde, SW-uppdatering
  test.ts              — 584 enhetstester (Node + fake-indexeddb)
e2e/app.spec.ts        — 6 E2E-tester (Playwright): desktop + mobil, UI och uträknade belopp
  components/
    ErrorBoundary.tsx  — fångar renderfel; visar felmeddelande + "Ladda om" istället för vit skärm
    Welcome.tsx        — skapa bokföring: namn + databasfil (FS Access API) / utan fil / öppna fil / JSON / SIE4
    OpenBokforing.tsx  — startgate när appen minns en bokföringsfil: "Öppna <namn>" (behörighet + inläsning)
    Dashboard.tsx      — KPI-kort; använd useLiveQuery i toppen (INTE i JSX)
    VoucherEntry.tsx   — bokföringsformulär, momshjälp, OCR-skanning, snabbval (TEMPLATE_LABELS)
    ChartOfAccounts.tsx — kontoplan CRUD; radering blockeras om kontot har transaktioner
    Reports.tsx        — tunn flik-router (~70 rader); flikarna bor i reports/
    GeminiImport.tsx   — importera verifikationer från Gemini JSON-export
    AiChat.tsx         — AI-chattbot (egen Gemini-nyckel, valideras); expert på skatt/juridik/appen
    Onboarding.tsx     — 8-stegs pedagogisk guide; flagga i settings, "Visa guiden" i sidomenyn
    Invoices.tsx       — flik-router för fakturering
    invoices/
      InvoiceForm.tsx  — skapa faktura; metod väljs per faktura (faktura/kontant)
      InvoiceList.tsx  — statusfilter, visa/skriv ut/dela/e-posta ARKIVERAD fil, registrera betalning, makulera
      InvoiceSettings.tsx — företagsuppgifter, nummerserie, WYSIWYG-temaredigerare + avancerat HTML-läge
    reports/
      shared.tsx       — Card / Row / TotalRow / buildBalMap
      ResultatTab.tsx  — resultaträkning
      BalansTab.tsx    — balansräkning
      HuvudbokTab.tsx  — huvudbok: sök (matchesSearch i shared), paginering, redigera/radera
      MomsTab.tsx      — momsrapport per period (rutorna 05-49 på periodens transaktioner)
      SkattTab.tsx     — NE-bilaga (översikt), egenavgifter, momsdeklaration, årsavslut
      DeklarationTab.tsx — blankettvy NE/INK2 per beskattningsår: justera rader, skriv ut, status, SRU-export
      BackupTab.tsx    — JSON-backup, SIE4 import/export, "Byt bokföring"
  lib/
    backup.ts          — buildBackupData()/applyBackupData() v3: ALLA tabeller + settings (ej ai/handle); exportBackup()
    sie.ts             — exportSIE() / importSIE(content, 'merge'|'replace') / decodeSIEBuffer (CP437)
    vat.ts             — splitVat() / vatRows() / VAT_OUT / VAT_IN — testbar logik
    ocr.ts             — scanReceipt(file) via Gemini Vision
    tax.ts             — calcNELines() / calcMomsLines() / uttaqTemplates() / calculateEgenavgifter()
    geminiImport.ts    — parseGeminiJson() / validateRows() / resolveAccount() / bookDraftRows()
    invoice.ts         — nummerserie, invoiceTotals(), bokning, arkivering, buildTemplateFromTheme (WYSIWYG-tema)
    period.ts          — periodRange/splitByPeriod: resultat = period, balans = ackumulerat t.o.m. periodslut
    yearEnd.ts         — årsavslut: 8999→2019 (31/12) + omföring till 2010 (1/1); 8999 exkluderas ur resultatrapporter
    attachments.ts     — kvittobilagor: ArrayBuffer i IndexedDB, 8 MB-gräns, base64 för backup, kaskadradering
    declaration.ts     — NE-blankettvy: B1-B16 (ackumulerat) + R1-R48 (år), justeringar, inlämningssteg, utskrift
    neSru.ts           — NE→SRU; B/R-fältkoder VERIFIERADE (BAS kopplingstabell); justeringsrader exporteras ej
    ink2.ts            — INK2R officiella poster 2.1-3.27, VERIFIERADE koder (BAS); INK2S exporteras ej
    sru/               — SRU-export M0: serialize() / parse / Latin-1 / Luhn (deterministisk)
    ai.ts              — AI-inställningar, nyckelvalidering, gateMessage(), buildSystemPrompt(), askAi()
    bokforingsfil.ts   — bokföringsdatabas som fil: meta i settings, FS Access-handle, createAutoSaver/watchDatabase
    markdown.ts        — säker MD-parser för AI-svar (block+inline, testbar); renderas i components/Markdown.tsx
    utils.ts           — formatCurrency()
```

---

## Kända fallgropar

### React
- **Hooks måste anropas före conditional returns** — alla hooks (useState, useEffect, useLiveQuery) måste stå överst i komponenten, INNAN alla `if (!x) return` — annars ändras hook-ordningen mellan renders och React kraschar med vit skärm
- **useLiveQuery auto-uppdaterar** — ingen manuell refresh behövs efter DB-ändringar

### Deployment
- **Repo-namnet har stort B** — `Bokf-ring-` inte `bokf-ring-` — påverkar base path och URL
- **`loadEnv` läser inte `process.env`** — använd `process.env.X ?? env.X` för CI-secrets
- **Aldrig pusha till gh-pages manuellt** — deploy-pages@v4 hanterar allt
- **PWA service worker** — använd `registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true` — annars fastnar gamla SW och servar stale cache på användarens enhet

### Bokföringsfil
- **Backupformat v3 = hela databasen** — buildBackupData sparar accounts/vouchers/transactions/attachments/invoices/declarations + settings (företagsuppgifter, FAKTURAMALL, nextInvoiceNumber). EXKLUDERADE settings: 'ai' (hemlig nyckel), 'bokforingsfil' (maskinspecifikt handtag), 'dbIdentity' (toppnivå). Utan detta tappas mall/nummerserie/fakturor vid filöppning på annan dator
- **wipeBokforing() vid "Byt bokföring"/reset** — rensar alla datatabeller + 'company'-settingen; behåller 'ai' + 'onboardingDone'. Callers rensar dessutom filhandtag (clearBokforingsfil) + identitet (clearIdentity)
- **Dexie-transaktion med 7 tabeller kräver array-formen** `db.transaction('rw', [t1..t7], cb)` — variadiska överlagringar kapar vid ~5
- **Databasidentitet:** dbId (UUID) + revision + modifiedAt i settings ('dbIdentity') och i filen; bumpIdentity() vid varje writeToFile; compareDb() avgör öppningsflödet (same/local-newer/different/no-local/legacy-file) — konfliktvyer i OpenBokforing
- **Identitetsnycklarna ('dbIdentity','bokforingsfil') är exkluderade från auto-sparningens hooks** — annars evig sparloop
- **IndexedDB är arbetskopian, filen är databasen** — auto-sparning (debounced 2,5 s) skriver hela backupen till handlen vid varje tabelländring (Dexie-hooks via watchDatabase)
- **"Byt bokföring" MÅSTE koppla från filen före tömning** — sparfunktionen läser meta per sparning och vägrar skriva utan handle; annars skrivs en tom databas över användarens fil
- **FileSystemFileHandle är strukturklonbar** och persisteras i settings; behörighet kräver användargest per besök (OpenBokforing-gaten)

### Databas
- **Nya standardkonton når inte befintliga användare automatiskt** — `initializeDb` seedar bara vid tom DB. Nya konton MÅSTE också läggas till i `PATCH_ACCOUNTS` (db.ts) så att befintliga databaser patchas vid uppstart. Dexie har inga foreign keys — transaktioner mot saknade konton sparas tyst
- **hasData = accountCount > 0** — inte voucherCount; en användare med kontoplan men noll verifikationer ska INTE se välkomstskärmen

### Bokföring
- **Balanscheck på sparade rader** — beräkna debet/kredit-diff ENBART på rader med valt konto (samma set som sparas), inte alla formulärrader
- **SIE-import mode** — `importSIE(content, 'merge')` eller `'replace'`
- **Verifikationer** redigeras/raderas från Rapporter → Huvudbok; state lyfts via `editId` i App.tsx; efter redigering navigeras användaren tillbaka till Rapporter
- **Mallkonton måste vara korrekta BAS-konton** — F-skatt = 2510 Skatteskulder (inte 2013 Egna uttag); slå upp kontot innan en mall skapas
- **Bilagor lagras som ArrayBuffer, inte Blob** — ArrayBuffer strukturklonas säkert i alla miljöer (inkl. fake-indexeddb i testerna); Blob skapas först vid visning. Bilagor måste rensas i ALLA raderingsflöden: verifikatradering, byt bokföring, backup-återställning, SIE-replace
- **8999 är reserverat för årsavslutet** — exkluderas ur resultaträkning/Översikt (RESULT_EXCLUDED_ACCOUNTS) men INGÅR i balansens beräknade resultat; NE/INK2/moms exkluderar det via sina intervall

---

## Bokföringsdomän

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
npm run test         # kör 584 enhetstester
npm run test:e2e     # E2E i webbläsare (desktop + mobil) — kräver Chromium
npm run build        # produktionsbygge — verifiera alltid innan push
git push origin main # triggar deploy automatiskt (~40 sek)
```

---

## Modellstrategi

Huvudsessionen körs på den mest kapabla modellen (Fable 5 / Opus). Kostnadsoptimering sker genom **delegering till subagenter med fasta modeller** — inte genom att byta huvudmodell:

| Uppgiftstyp | Utförs av | Modell |
|---|---|---|
| Bokföringslogik, moms, SRU/SIE-serialisering, DB-migrationer, buggar med okänd rotorsak, arkitektur | **Huvudsessionen direkt** | Sessionens modell (Fable/Opus) |
| Rutin-UI enligt befintligt mönster, Tailwind-justeringar, enkla refaktoreringar, testuppdateringar | Subagent **`rutinarbete`** | Sonnet |
| Rena dokumentationsuppdateringar (README, todo, lessons) | Subagent **`dokumentation`** | Haiku |

Regler:
- Delegera PROAKTIVT när en uppgift matchar en subagent — vänta inte på uppmaning.
- Delegera ALDRIG bokföringslogik eller formatserialisering — fel där är tysta och juridiskt allvarliga.
- Blandade uppgifter delas upp: huvudsessionen gör den kritiska delen, subagenten resten.
- Verifiering efter subagentarbete: huvudsessionen kör alltid `npm run test` + `npm run build` innan commit.
- Agentdefinitionerna bor i `.claude/agents/` och är incheckade — uppdatera dem när policyn ändras.

---

## Effort Levels

Select effort based on task complexity — state which level you're using and why.

| Task type | Effort |
|---|---|
| Typos, simple renames, obvious one-liners | standard |
| New features, bug investigation, refactors | high |
| Architecture decisions, migrations, unknown failure modes, cross-cutting changes | xhigh |

Drop back to `high` after a heavy task is done. Do not run `xhigh` on routine work.

---

## Workflow Orchestration

### 1. Plan First

Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).

If something goes sideways: STOP and re-plan immediately — do not keep pushing.

Use plan mode for verification steps, not just building.

Write detailed specs upfront to reduce ambiguity.

### 2. Extended Thinking for Hard Problems

For architectural decisions, non-obvious bugs, or unfamiliar failure modes:
reason through at least 3 approaches before recommending one.
Show trade-offs explicitly. Do not jump to the first solution that comes to mind.

### 3. When to Suggest a Dynamic Workflow

If a task spans 5+ files, requires parallel investigation, or involves a migration:
suggest running as a Dynamic Workflow before starting.
Include the word "workflow" in the plan summary so Claude Code can trigger orchestration.

### 4. Subagent Strategy

Use subagents to keep the main context window clean.

Offload research, exploration, and parallel analysis to subagents.

One task per subagent for focused execution.

For complex problems: throw more compute at it via subagents rather than cramming into one context.

### 5. Self-Improvement Loop

After ANY correction from the user: update `tasks/lessons.md` with the pattern.

Write rules that prevent the same mistake from recurring.

Ruthlessly iterate on these lessons until mistake rate drops.

Review lessons at session start for relevant context.

### 6. Verification Before Done

Never mark a task complete without proving it works.

**Mandatory checklist before marking done:**
- [ ] Tests pass
- [ ] No regressions introduced
- [ ] Edge cases considered
- [ ] Diff reviewed against main

If any item fails: re-enter planning. Do NOT patch around it.

Ask yourself: "Would a staff engineer approve this?"

### 7. Demand Elegance (Balanced)

For non-trivial changes: pause and ask "is there a more elegant way?"

If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."

Skip this for simple, obvious fixes — do not over-engineer.

Challenge your own work before presenting it.

### 8. Autonomous Bug Fixing

When given a bug report: just fix it. Do not ask for hand-holding.

Point at logs, errors, failing tests — then resolve them.

Zero context switching required from the user.

Go fix failing CI tests without being told how.

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

**Simplicity First**: Make every change as simple as possible. Impact minimal code.

**No Laziness**: Find root causes. No temporary fixes. Senior developer standards.

**Minimal Impact**: Changes should only touch what is necessary. Avoid introducing bugs.

**Comment on Code**: Write clear and understandable comments for developers to follow.

**Think Before Proposing**: For architectural decisions or non-obvious bugs, reason through trade-offs before presenting a solution. Show your reasoning when it matters.
