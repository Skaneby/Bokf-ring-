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
- [x] 245 enhetstester — bokföringsscenarier, SIE, skatt, Gemini-import, smoke tests

### Öppet / Förbättringar

- [ ] Periodfiltrering i rapporter (månad/kvartal/år)
- [ ] Sökfunktion i huvudbok
- [ ] Momsrapport per period (aggregerad 2610/2620/2630/2640)
- [ ] Årsavslut — nollställ resultatkonton mot 2010 vid nytt räkenskapsår
- [ ] Export av NE-bilagan som PDF/utskriftsvänlig vy
- [ ] Kvittobilagor — spara kvittobild kopplad till verifikation (IndexedDB blob)
