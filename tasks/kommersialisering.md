# Plan: kommersialisering av Lokal Bokföring

> Sparad som minne (2026-07). Allmän vägledning, inte juridisk rådgivning —
> stäm av villkor + GDPR med jurist/redovisningskonsult före lansering.

## Utgångsläge (styrkor att bevara)
- **Local-first, ingen backend** — all data i användarens webbläsare (IndexedDB) +
  valfri lokal fil. Detta är den STÖRSTA compliance-fördelen: minimalt GDPR-ansvar,
  ingen datalagring att skydda. **Behåll local-first så länge det går.**
- Egen AI-nyckel per användare → en del dataansvar ligger hos användaren, inte oss.

## Inga myndighetstillstånd krävs för själva mjukvaran
Man behöver varken licens eller auktorisation för att sälja bokföringsprogram.
Auktoriserad redovisningskonsult krävs bara om man säljer *tjänsten* redovisning.

## Krav & risker i prioritetsordning

### 🔴 P0 — GDPR / dataskydd
- Så länge appen är local-only: håll det så. Ingen persondata hos oss = lågt ansvar.
- **Gemini-API:t** är känsligast: kvitton/promptar skickas till Google (utanför EU).
  Egen nyckel mildrar men informera i policy att data skickas till Google vid OCR/AI.
- Om moln/konton införs → personuppgiftsbiträde: DPA med kunder, registerförteckning,
  laglig grund, EU-lagring, säkerhet (art. 32), DPA med Google.

### 🔴 P0 — Ansvar & friskrivning
- Fel i moms/deklaration → skadeståndsrisk. Tydliga ansvarsfriskrivningar (finns delvis:
  "generell vägledning") + ansvarsbegränsning i villkoren. Överväg ansvarsförsäkring.
- Marknadsför inte mer än produkten verifierat kan (SRU-fältkoder är ännu "preliminära").

### 🟠 P1 — Eget företag & moms
- Företagsform (enskild firma/AB) + F-skatt + momsregistrering.
- SaaS = digital tjänst → 25 % moms. Försäljning till EU-konsumenter → OSS.

### 🟠 P1 — Villkor & konsumenträtt
- Tydliga avtalsvillkor. Distansavtalslagen (ångerrätt) kan gälla mot konsument.
- Förtydliga att ANVÄNDAREN ansvarar för arkivering (7 år) + egna backuper.
  Räkenskapsinformation ska i regel förvaras i Sverige/EU (relevant först vid moln).

### 🟡 P2 — Tredjepart & licenser
- Gemini API:s villkor för kommersiell användning (egen nyckel = rent).
- Beroenden (React m.fl. MIT) + format (BAS, SIE, SRU) fria att använda.

### 🟡 P2 — Övrigt
- EU AI Act: chatbot sannolikt låg risk, men transparenskrav (uppfyllt).
- European Accessibility Act (2025): tillgänglighet (WCAG) för konsumenttjänster.
- Kassaregisterlagen gäller INTE online-SaaS-abonnemang.
- Direktinlämning till Skatteverket (framtida "Spår B") kräver avtal + teknisk anslutning;
  dagens filexport (användaren laddar upp själv) kräver inget sådant.

## Föreslagen fasning
1. **Fas 0 – juridik light:** villkor + integritetspolicy + tydlig friskrivning. Företag/moms.
2. **Fas 1 – betald local-first:** Stripe-abonnemang, licensnyckel, fortsatt ingen datalagring.
3. **Fas 2 – verifiering:** SRU-fältkoder mot Skatteverkets testtjänst (se seed.ts). Ta bort "preliminär".
4. **Fas 3 – (valfritt) moln:** synk/konton → full GDPR-apparat, EU-lagring, DPA:er.
5. **Fas 4 – (valfritt) direktinlämning:** avtal + teknisk anslutning mot Skatteverket.

## Nästa konkreta steg (ej gjorda)
- [ ] Utkast: användarvillkor + integritetspolicy + ansvarsfriskrivning.
- [ ] Verifiera SRU-fältkoder mot Skatteverkets testtjänst (använd seed-datan).
- [ ] Besluta prismodell + betalflöde (Stripe).
