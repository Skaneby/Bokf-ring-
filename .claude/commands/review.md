---
description: Granska aktuell diff mot main — kör tester och bygge, leta regressioner och edge-cases.
argument-hint: [valfritt: fil eller område att fokusera på]
---

Använd effort-nivå **high**. Detta är en granskning — ändra inte kod om inte användaren ber om det, rapportera fynd.

Fokus (valfritt): $ARGUMENTS

Läs `CLAUDE.md` (bokföringsdomän + fallgropar) och `tasks/lessons.md` för känd kontext.

Gör så här:

1. **Titta på diffen mot `main`** (`git diff main...HEAD` eller osparade ändringar med `git diff`). Fokusera på $ARGUMENTS om angivet.
2. **Kör verifiering:** `npm run test` (alla gröna?) och `npm run build` (rent?). Rapportera exakta resultat — hymla inte om tester faller.
3. **Granska mot dessa kriterier:**
   - Korrekthet — särskilt bokföringslogik: debet = kredit, kontomappningar, momsberäkning, SRU/SIE-serialisering. Fel här är tysta och juridiskt allvarliga.
   - Regressioner — bryts något befintligt beteende?
   - Edge-cases — tomma värden, noll, negativa belopp, saknade konton, år-/periodgränser.
   - React-fallgropar — hooks före conditional returns; useLiveQuery i toppen.
   - Enkelhet — onödig komplexitet eller påverkansyta som kan krympas.
4. **Rapportera** rankat efter allvar (mest allvarligt först), med `fil:rad` och konkret felscenario per fynd. Säg tydligt om allt ser bra ut.

Fråga dig: "Skulle en staff engineer godkänna detta?"
