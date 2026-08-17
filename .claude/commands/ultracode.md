---
description: Maximal rigor-implementation — orkestrera subagenter, verifiera hårt mot main innan något markeras klart.
argument-hint: [vad som ska byggas]
---

Använd effort-nivå **xhigh**. Detta är för tvärgående ändringar (5+ filer), migrationer eller något som kräver parallell utforskning.

Uppgift: $ARGUMENTS

Läs `CLAUDE.md`, `tasks/todo.md` (finns en plan?) och `tasks/lessons.md` innan du börjar.

Arbetssätt:

1. **Planera först** om ingen färsk plan finns i `tasks/todo.md` — kör `/ultraplan`-flödet, stäm av, och fortsätt sedan.
2. **Orkestrera med subagenter** för att hålla huvudkontexten ren:
   - Research/utforskning/parallell analys → subagenter (en uppgift per agent).
   - Rutin-UI enligt mönster, Tailwind, enkla refaktoreringar, testuppdateringar → subagent `rutinarbete` (Sonnet).
   - Rena dokumentationsuppdateringar → subagent `dokumentation` (Haiku).
   - Bokföringslogik, moms, SRU/SIE-serialisering, DB-migrationer, buggar med okänd rotorsak → **huvudsessionen själv, aldrig delegerat**.
3. **Bocka av `tasks/todo.md`** löpande och ge en kort summering vid varje steg.
4. **Verifiering innan klart (obligatorisk checklista):**
   - [ ] `npm run test` — alla gröna
   - [ ] `npm run build` — rent bygge
   - [ ] Inga regressioner
   - [ ] Edge-cases hanterade
   - [ ] Diff granskad mot `main`
5. Faller något: gå tillbaka till planering, patcha inte runt problemet.

Fråga dig: "Skulle en staff engineer godkänna detta?" Om nej — iterera tills ja.

Commit + push till `main` först när allt ovan är grönt (följ deploy-reglerna i CLAUDE.md). Uppdatera `tasks/lessons.md` om användaren korrigerar dig under vägen.
