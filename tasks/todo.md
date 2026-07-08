# Todo — Lokal Bokföring

## Status: Juli 2026

### Kritiskt att göra manuellt

- [ ] **Rensa gammal service worker på Android** — om senaste ändringar inte syns:
  - Öppna Chrome (inte hemskärmsgenvägen)
  - Tre punkter → Inställningar → Webbplatsinställningar → Alla webbplatser
  - Hitta `skaneby.github.io` → Rensa och återställ
  - Alternativ: öppna appen med `?reset=1` i URL:en (OBS: raderar även bokföringsdata)

### Klart ✓

**Kärnfunktioner**
- [x] Dubbelbokföring med balansvalidering
- [x] Balanscheck räknar enbart på rader med valt konto (inte tomma formulärrader)
- [x] Momssplit: 6% / 12% / 25% ingående och utgående
- [x] OCR-skanning med Gemini Vision — kvitton klassificeras korrekt som ingående
- [x] Dashboard med KPI-kort
- [x] Rapporter: Resultat, Balans, Huvudbok, Skatt & Deklaration, Säkerhetskopiering
- [x] SIE4-export och import (merge/replace, CP437-avkodning)
- [x] JSON-backup export och import
- [x] "Byt bokföring" — tvåstegsbekräftelse i Rapporter → Säkerhetskopiering
- [x] SIE4-import på välkomstskärmen (vid tom DB)
- [x] PWA med auto-uppdatering (skipWaiting + clientsClaim + autoUpdate)
- [x] Deployment: GitHub Actions → main → GitHub Pages (~40 sek)

**Skatt & egenföretagare (juli 2026)**
- [x] NE-bilagan (SKV 2161) — automatisk sammanställning R1–R48
- [x] Egenavgifter — beräkning per åldersgrupp + bokning med ett klick (8422/2514)
- [x] Momsdeklaration — rutorna 05, 10, 11, 12, 48, 49
- [x] Snabbval i Bokför: eget uttag, F-skatt (2510), egen insättning, egenavgifter

**Gemini-import (juli 2026)**
- [x] Klistra in JSON från Gemini Gem → granska → bokför
- [x] Kontoförslag i tre nivåer: Gemini → ordbok (25+ nyckelord) → historik
- [x] Huvudboksförhandsvisning per rad innan bokning

**Stabilitet & arkitektur (juli 2026)**
- [x] React ErrorBoundary — renderfel visar felmeddelande istället för vit skärm
- [x] Hooks-bugg fixad — useEffect efter early returns orsakade vit skärm
- [x] DB-patch vid uppstart — befintliga användare får nya standardkonton automatiskt
- [x] F-skatt-mall bokar mot 2510 Skatteskulder (var felaktigt 2013 Egna uttag)
- [x] Reports.tsx uppdelad i 5 flik-komponenter (components/reports/)
- [x] Huvudbok paginerad (25 verifikationer/sida)
- [x] Skyddad kontoradering — konton med transaktioner kan inte raderas
- [x] Auto-navigering tillbaka till Rapporter efter verifikationsredigering
- [x] 429 enhetstester — bokföringsscenarier, SIE, skatt, Gemini-import, fakturering, SRU, deklaration, smoke tests

**Fakturering (juli 2026)**
- [x] Fakturor med löpande, obruten nummerserie (räknas bara uppåt, återanvänds aldrig)
- [x] Bokföring enligt fakturametoden (vid skapande, 1510) eller kontantmetoden (vid betalning)
- [x] Registrera betalning + makulera (bokför reversering)
- [x] HTML-fakturamall — standard eller importerad egen mall med {{tokens}}
- [x] Skicka: skriv ut/PDF, ladda ned, dela (Web Share), e-post
- [x] Företagsinställningar: orgnr, momsnr, bankgiro, betalningsvillkor
- [x] Nytt konto 1510 Kundfordringar (patchas in i befintliga databaser)

**AI-hjälp & onboarding (juli 2026)**
- [x] AI-chattbot (flik "AI-hjälp"): expert på svensk skatt/juridik/bokföring + appen själv
- [x] Kräver användarens egen Gemini-nyckel — valideras med testanrop, lagras lokalt
- [x] Utan validerad nyckel svarar boten med instruktion om hur nyckeln läggs in
- [x] Systemprompt med användarens kontoplan, datamängd och komplett appguide
- [x] Pedagogisk onboarding: 8-stegsguide (dubbelbokföring, moms, fakturor, deklaration, backup)
- [x] Guiden visas automatiskt första gången + kan öppnas när som helst via "Visa guiden"

**Optimeringar (juli 2026)**
- [x] Halvskrivna verifikationer överlever flikbyte (VoucherEntry hålls monterad)
- [x] Lazy loading: Gemini SDK + fyra flikar utanför startbundeln (401 → 364 kB)
- [x] Enhetliga inline-bekräftelser (inga window.confirm/alert)
- [x] Mobil: inputMode=decimal, safe-area-insets, större touch-ytor, responsiva fakturarader
- [x] Tillgänglighet: aria-labels på ikonknappar och radväljare
- [x] @types/react installerat — typkontrollen fungerar på riktigt

### Deklarationsmodul (planerad — spec klar)

Spec: `docs/deklarationsmodul-spec.md` (SRU-filöverföring + manuell deklaration + framtida API-spår)

- [x] M0: `lib/sru/` — datamodell, serialiserare, golden files, property-tester (32 nya tester)
- [x] M1: Spår 0 — blankettvy NE med manuella justeringar, utskrift, INK1-summering (29 nya tester)
- [x] M2: Spår A — SRU-export (INFO.SRU + BLANKETTER.SRU), validering, inlämningsguide (20 nya tester)
  - NE:s fältkoder VERIFIERADE mot BAS kopplingstabell (B1=7200…B16=7383, R1=7400…R11=7440); underlag: docs/underlag-NE-kopplingstabell-BAS.pdf
  - Blankettvyn utökad med balansposterna B1-B16 (ackumulerade saldon per bokslutsdagen)
  - Justeringsrader (R12-R48) exporteras EJ ännu — saknar verifierade koder, kompletteras i e-tjänsten
- [x] M3 (INK2-delen): blankettvy INK2R/INK2S för aktiebolag + SRU-export
  - INK2R:s fältkoder VERIFIERADE mot BAS kopplingstabell (2.1=7201 … 3.27=7550) inkl. nettoposter med teckenberoende kod; underlag: docs/underlag-INK2-kopplingstabell-BAS.pdf
  - Blankettvyn följer officiell postnumrering (2.1-2.50, 3.1-3.27)
  - INK2S (4.x) exporteras EJ — ej kontomappad, kompletteras i e-tjänsten
  - Byråstöd/roller/auditlogg kräver plattformsspåret (backend, flera användare) — utanför lokal app-scope, se docs/deklarationsmodul-spec.md §3-4
- [ ] M4: Spår B — API-integration mot Skatteverket (kräver avtal + verifierad tjänstebeskrivning)
- [x] Blankettkod NE-2025P4 verifierad mot blankett SKV 2161 utg. 13 (docs/underlag-NE-blankett-SKV2161-2025.pdf)
- [x] Justeringsradernas numrering rättad mot blanketten: R13 kostnader ej avdrag, R14 intäkter ej upptas (R12 = överföring av R11)
- [ ] Verifiera kvarvarande mot Skatteverket: fältkoder för NE:s justeringsrader R12-R48 och INK2S 4.x (kräver SKV:s fältlista), INK2-blankettens P-suffix, encoding — kör första fil i SKV:s testtjänst

### Öppet / Förbättringar (prioriterade)

- [ ] **P1 — Sökfunktion i huvudbok**: störst vardagsnytta, minst insats (filtrera på beskrivning/konto/belopp)
- [ ] **P2 — Periodfiltrering i rapporter** (månad/kvartal/år): krävs som grund för P3, stor nytta vid momsdeklaration
- [ ] **P3 — Momsrapport per period**: bygger på P2 — visar rutorna 05/10-12/48/49 per redovisningsperiod
- [ ] **P4 — Årsavslut**: nollställ resultatkonton mot 2010 vid nytt räkenskapsår; viktig vid årsskiftet, kräver domännoggrannhet
- [ ] **P5 — Kvittobilagor**: spara kvittobild kopplad till verifikation (IndexedDB blob); störst insats, lagringstungt
- [x] Export av NE-bilagan som utskriftsvänlig vy — klar via "Skriv ut underlag" i Deklarationsfliken

### Framtida moduler (underlag finns)

- [ ] KU-filer (kontrolluppgifter KU10-KU81) — XML-format; fältlista uppladdad (Bilaga 2b Fältlista 9.0)
- [ ] Arbetsgivardeklaration på individnivå (AGI) — XML-format; fältlista uppladdad (Bilaga Fältlista 1.1.17.1)
- OBS: dessa är ANDRA format än SRU — inkomstdeklarationens fältkoder verifieras via SKV 269/Fältlistor för inkomstdeklaration
