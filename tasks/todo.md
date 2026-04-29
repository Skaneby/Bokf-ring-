# Todo — Lokal Bokföring

## Status: April 2026

### Kritiskt att göra manuellt

- [ ] **Ta bort `gh-pages` branch på remote** — kan inte göras av Claude (403):
  - github.com/Skaneby/Bokf-ring- → Code → Branches → `gh-pages` → papperskorg
  - Bekräfta att Settings → Pages → Source = **"GitHub Actions"**

- [ ] **Rensa gammal service worker på Android** — för att se senaste ändringar:
  - Öppna Chrome (inte hemskärmsgenvägen)
  - Tre punkter → Inställningar → Webbplatsinställningar → Alla webbplatser
  - Hitta `skaneby.github.io` → Rensa och återställ

### Klart ✓

- [x] Dubbelbokföring med balansvalidering
- [x] Balanscheck fixad — räknar enbart på rader med valt konto (inte tomma formulärrader)
- [x] Momssplit: 6% / 12% / 25% ingående och utgående
- [x] OCR-skanning med Gemini Vision — kvitton klassificeras korrekt som ingående (inköp)
- [x] Dashboard med KPI-kort
- [x] Rapporter: Resultat, Balans, Huvudbok, Säkerhetskopiering
- [x] SIE4-export och import (merge/replace)
- [x] JSON-backup export och import
- [x] "Byt bokföring" — tvåstegsbekräftelse i Rapporter → Säkerhetskopiering
- [x] SIE4-import på välkomstskärmen (vid tom DB)
- [x] PWA med auto-uppdatering (skipWaiting + clientsClaim + autoUpdate)
- [x] 156 enhetstester — alla bokföringsscenarier + smoke tests
- [x] Smoke tests — verifikation → korrekt rapport-kategori
- [x] Deployment: GitHub Actions → main → GitHub Pages (~40 sek)

### Öppet / Förbättringar

- [ ] Momsrapport-vy (aggregerad 2610/2620/2630/2640 per period)
- [ ] Periodfiltrering i rapporter (månad/kvartal/år)
- [ ] Sökfunktion i huvudbok
