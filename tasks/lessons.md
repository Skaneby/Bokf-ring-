# Lessons Learned

## Deployment

- **loadEnv vs process.env**: `loadEnv()` läser enbart `.env`-filer — INTE systemmiljövariabler. GitHub Actions secrets är systemmiljövariabler. Använd alltid `process.env.X ?? env.X` för CI-secrets.

- **Case sensitivity**: GitHub Pages URL matchar repo-namnet exakt. `Bokf-ring-` ≠ `bokf-ring-`. Verifiera alltid att base path matchar repo-namnets skiftläge i både vite.config.ts och index.html.

- **Branch discipline**: Jobba ENBART på `main`. GitHub Actions hanterar all deployment via `actions/deploy-pages@v4`. Skapa aldrig `gh-pages` eller andra deployment-branches. Om de existerar — ta bort dem omedelbart.

- **GitHub Pages source måste vara "GitHub Actions"**: Om den är satt till "Deploy from branch" ignoreras alla `deploy-pages@v4`-körningar tyst. Kontrollera Settings → Pages → Source efter varje repo-klon.

- **_headers fungerar inte på GitHub Pages**: `_headers`-filer är Netlify-specifika. GitHub Pages ignorerar dem. Använd meta http-equiv-taggar i HTML istället.

- **Verifiera deployment innan du rapporterar klart**: Kolla alltid GitHub Actions-körningens status och att live-URL:en visar rätt innehåll.

## PWA / Service Worker

- **skipWaiting + clientsClaim är obligatoriska**: Utan dem installeras ny SW men aktiveras aldrig förrän alla flikar stängs. Användaren ser då aldrig uppdateringar. Konfigurera alltid:
  ```
  registerType: 'autoUpdate'
  workbox: { skipWaiting: true, clientsClaim: true }
  ```

- **Gammal SW blockerar uppdateringar**: Om en gammal SW utan skipWaiting finns på användarens enhet, intercepts den alla nätverksanrop. Ny SW kan inte ta över. Enda lösningen: användaren rensar webbplatsdata i Chrome.

- **Ta aldrig bort PWA**: PWA är nödvändigt för Android-installation. Rätt fix för SW-problem är korrekt konfiguration, inte att ta bort hela PWA-pluginet.

## Bokföring / Affärslogik

- **Balanscheck på sparade rader**: `totalDebit/totalCredit` måste beräknas från rader med valt konto (samma set som faktiskt sparas). Om man räknar alla formulärrader inkl. tomma, kan ett balanserat formulär spara obalanserade transaktioner i DB.

- **Kontoartsmappning i rapporter**: `expense` visar positivt databassaldo direkt. `revenue` måste negeras. `asset`/`liability`/`equity` är balansräkningskonton. Blanda aldrig ihop dem.

- **OCR-riktning default**: Kvitton och fakturor ska som default klassificeras som ingående (inköp, `vatDir: 'in'`). Endast explicit försäljningsdokumentation ska vara `'out'`.

## React

- **Hooks i JSX är förbjudet**: `useLiveQuery`, `useState` etc. måste alltid anropas i toppen av komponenten, aldrig inuti `return()`, villkorssatser eller loopar.

- **useLiveQuery auto-uppdaterar**: Ingen manuell refresh behövs efter DB-ändringar.

- **Dexie filter på icke-indexerade fält**: `where('description')` kastar SchemaError om fältet inte är indexerat. Använd `.toArray().find()` istället.

## Process

- **Läs skärmbilder noggrant**: Konsolfel innehåller exakt problem. Gissa inte — läs varje rad.

- **Loopa inte på samma fix**: Om en fix inte fungerar efter ett försök, stoppa och diagnostisera om från grunden.

- **Verifiera rotorsak innan fix**: Att ändra flera saker samtidigt gör det omöjligt att veta vad som fungerade.

- **Bygg alltid innan push**: `npm run build` måste lyckas. Kör sedan `npm run test`.

- **Rapportera inte som klart utan bevis**: "Det borde fungera" räcker inte. Verifiera med Actions-loggar och live-URL.

- **_headers är Netlify — inte GitHub Pages**: Blanda inte ihop plattformspecifika funktioner.
