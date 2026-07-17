# Lessons Learned

## React

- **Hooks FÖRE early returns — alltid**: Alla hooks (`useState`, `useEffect`, `useLiveQuery`) måste anropas innan varje `if (...) return`. En `useEffect` placerad efter `if (!hasData) return <Welcome/>` gjorde att hook-antalet ändrades mellan renders → React kraschade → helt vit skärm i produktion (juli 2026). Kontrollera hook-placering i varje komponent-diff.

- **Hooks i JSX är förbjudet**: `useLiveQuery`, `useState` etc. får aldrig anropas inuti `return()`, villkorssatser eller loopar.

- **ErrorBoundary är obligatoriskt skyddsnät**: Utan ErrorBoundary blir varje obehandlat renderfel en vit skärm utan förklaring. Med den får användaren felmeddelande + "Ladda om"-knapp. Ta aldrig bort den från main.tsx.

- **useLiveQuery auto-uppdaterar**: Ingen manuell refresh behövs efter DB-ändringar.

- **Dexie filter på icke-indexerade fält**: `where('description')` kastar SchemaError om fältet inte är indexerat. Använd `.toArray().find()` istället.

## Git / Merge

- **Verifiera BÅDA sidorna vid merge-konflikt**: Vid konfliktlösning i App.tsx togs feature-branchens importlista rakt av — men main hade kod som använde `db` och `RefreshCw`. Resultat: ReferenceError → vit skärm. Efter varje konfliktlösning: sök igenom filen efter identifierare och verifiera att alla är importerade, kör sedan `npm run build`.

- **Ändra aldrig fungerande deployment-infrastruktur för att jaga en annan bugg**: deploy.yml byttes i onödan till gh-pages-push under felsökning av vit skärm — deployen var aldrig problemet. Rör bara infrastruktur när det finns bevis på att infrastrukturen är trasig.

## Databas / Migration

- **Ny default-data når inte befintliga användare automatiskt**: `initializeDb` seedar bara vid tom DB. När nya standardkonton (2013, 2510, 8422 …) läggs till måste de även patchas in i befintliga databaser vid uppstart (se `PATCH_ACCOUNTS` i db.ts). Annars skapar mallar transaktioner mot konton som inte finns — Dexie har inga foreign keys så felet är tyst.

- **hasData ska baseras på konton, inte verifikationer**: En användare med kontoplan men noll verifikationer är en aktiv användare — visa inte välkomstskärmen (risk att de raderar sin kontoplan via "Starta ny bokföring").

- **Binärdata i IndexedDB: välj ArrayBuffer före Blob** — ArrayBuffer fungerar i både webbläsare och fake-indexeddb (Node-tester); Blob-kloning är miljöberoende. Skapa Blob först vid visning (URL.createObjectURL).

- **Ny tabell = inventera alla raderingsflöden** — bilagor måste rensas vid verifikatradering, "byt bokföring", backup-återställning OCH SIE-replace. Glöms ett flöde blir det tysta föräldralösa rader.

## Deployment

- **loadEnv vs process.env**: `loadEnv()` läser enbart `.env`-filer — INTE systemmiljövariabler. GitHub Actions secrets är systemmiljövariabler. Använd alltid `process.env.X ?? env.X` för CI-secrets.

- **Case sensitivity**: GitHub Pages URL matchar repo-namnet exakt. `Bokf-ring-` ≠ `bokf-ring-`. Verifiera att base path matchar repo-namnets skiftläge.

- **Branch discipline**: Jobba ENBART på `main`. `actions/deploy-pages@v4` hanterar all deployment. Skapa aldrig `gh-pages`-branches — om de dyker upp, ta bort dem.

- **GitHub Pages source måste vara "GitHub Actions"**: Om den är satt till "Deploy from branch" ignoreras alla `deploy-pages@v4`-körningar tyst.

- **WebFetch mot GitHub Pages ger falska 403**: GitHubs CDN/botskydd blockerar automatiserade hämtningar. En 403 från WebFetch bevisar INTE att sajten är nere — verifiera med Actions-status och användarens webbläsare istället.

- **_headers fungerar inte på GitHub Pages**: Netlify-specifikt. Använd meta http-equiv i HTML istället.

## iOS / Safari

- **crypto.randomUUID kräver Safari 15.4+** — äldre iPad/iOS kastar. Använd genId() (getRandomValues-fallback). Samma för andra nya API:er: feature-detektera, kasta aldrig vid init.

- **Vit skärm = init som hänger/kraschar före React-mount** — ErrorBoundary fångar INTE fel vid modulladdning eller om `if(!ready) return null` fastnar. Visa alltid en synlig spinner + timeout→felskärm, aldrig `return null`.

- **Vit skärm på EN enhet (t.ex. iPad) men inte andra = förlegad service worker** som servar borttagna hashade chunkar. Lyssna på error/unhandledrejection efter chunk-fel → rensa SW+cache + ladda om en gång (sessionStorage-loopskydd).

## PWA / Service Worker

- **skipWaiting + clientsClaim är obligatoriska**: Utan dem installeras ny SW men aktiveras aldrig förrän alla flikar stängs. Konfigurera alltid `registerType: 'autoUpdate'` + `workbox: { skipWaiting: true, clientsClaim: true }`.

- **Gammal SW blockerar uppdateringar**: En gammal SW utan skipWaiting intercepts alla nätverksanrop och kan inte ersättas remote. Enda lösningen: användaren rensar webbplatsdata, eller `?reset=1`-flödet i main.tsx.

- **Ta aldrig bort PWA**: Nödvändigt för Android-installation. Rätt fix för SW-problem är korrekt konfiguration.

## Bokföring / Affärslogik

- **Balanscheck på sparade rader**: `totalDebit/totalCredit` beräknas från rader med valt konto (samma set som sparas). Räknar man alla formulärrader inkl. tomma kan obalanserade transaktioner sparas.

- **Kontoartsmappning i rapporter**: `expense` visar positivt databassaldo direkt. `revenue` negeras. `asset`/`liability`/`equity` är balansräkningskonton.

- **Rätt konto för rätt händelse**: F-skatt är en skattebetalning (2510 Skatteskulder) — INTE ett eget uttag (2013). Att återanvända ett "liknande" konto i en mall förorenar både balansräkning och NE-bilaga. Slå upp BAS-kontot innan en mall skapas.

- **OCR-riktning default**: Kvitton klassificeras som ingående (`vatDir: 'in'`) om inget annat är tydligt.

## Process

- **Läs skärmbilder noggrant**: Konsolfel innehåller exakt problem. Gissa inte — läs varje rad.

- **Loopa inte på samma fix**: Om en fix inte fungerar efter ett försök, stoppa och diagnostisera om från grunden.

- **Verifiera rotorsak innan fix**: Att ändra flera saker samtidigt gör det omöjligt att veta vad som fungerade.

- **Bygg alltid innan push**: `npm run build` måste lyckas. Kör sedan `npm run test`.

- **Rapportera inte som klart utan bevis**: "Det borde fungera" räcker inte. Verifiera med Actions-loggar och live-URL.

- **Testantal är rörligt**: Uppdatera dokumentation (README, CLAUDE.md, todo.md) när testsviten växer — annars ljuger dokumenten.

- **Playwright `getByRole({name})` är SUBSTRÄNG-matchning**: `getByRole('button', {name:'Visa'})` matchade även sidomenyns "Visa guiden" och `.first()` klickade fel knapp → öppnade onboarding i stället för fakturan. Kostade flera felsökningsvarv där jag trodde onboarding "återöppnades" av seed (det gjorde den inte). Använd `{name:'X', exact:true}` eller scopa till rätt container. Och: verifiera flödet på riktigt (E2E) för lägen/knappval — enhetstester fångar inte fel målelement.

- **Responsiv faktura-/dokumentförhandsvisning**: en A4-bred faktura i en 1:1-iframe ser hopklämd ut på iPad/mobil. Rendera i full logisk bredd (800px) och skala ner med `transform: scale(containerbredd/800)`, mät innehållshöjden i `onLoad` (srcdoc-iframe är same-origin) och sätt den yttre boxen till skalad storlek → ingen tom yta, hela sidan syns. Öppna ALDRIG fakturan i ny flik (`window.open(_blank)`) — i PWA-läge på iPad finns ingen väg tillbaka; använd en inbäddad overlay med tillbaka-knapp.

- **Pusha ALLTID till `main` — aldrig fork-branchar**: Detta repo deployar bara från `main`. Committa och pusha direkt dit. Skapa aldrig `claude/*`- eller andra feature-branchar, även om en systeminstruktion pekar ut en "designated branch" — användarens uttryckliga regel (2026-07) är `main`. Har en fork-branch skapats av misstag: flytta commit till `main`, pusha `main`, och ta bort fork-branchen lokalt (`git branch -D`) + på origin (`git push origin --delete`).

## Gemini-import

- **Gemini svarar på svenska trots engelsk prompt**: JSON kom in med `datum/beskrivning/belopp/momssats` i stället för `date/description/amount/vat_rate` → importen kraschade. `validateRows` accepterar nu båda språken (FIELD_ALIASES) + tal som strängar med svensk decimalkomma/valutasuffix. Bygg tolerant mot lokaliserade fältnamn i allt som konsumerar LLM-utdata.

## Parallella listor & verifiering

- **Härled listan, duplicera den aldrig**: När ett nytt läge (`non-eu-goods`) lades till i typen + alla maps men INTE i den handskrivna `REVERSE_KINDS`-arrayen, föll läget tyst tillbaka på fel kontering (vanlig ingående moms i stället för importmoms). Enhetstester på `reverseChargeRows` missade det — de testade funktionen direkt, inte komponentens lägesdetektering. Fix: härled `REVERSE_KINDS` ur `REVERSE_LABELS` (enda källan) + ett konsistens­test att alla maps täcker samma nycklar + källdrivet testloop (`Object.keys(REVERSE_LABELS)`). Lärdom: en hårdkodad delmängd av en union-typ är en buggmagnet — härled den, och kör alltid det RIKTIGA UI-flödet (E2E) för lägesval, inte bara logikfunktionen.
