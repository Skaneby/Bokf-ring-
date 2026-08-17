---
description: Genomför den godkända planen i tasks/todo.md — bocka av löpande, förklara ändringar, verifiera innan klart.
argument-hint: [valfritt: vilken plan/punkt]
---

Använd effort-nivå **high**. Genomför planen som redan ligger i `tasks/todo.md`.

Fokus (valfritt): $ARGUMENTS

Läs `tasks/todo.md` (planen), `CLAUDE.md` (fallgropar) och `tasks/lessons.md` innan du börjar. Finns ingen plan — kör `/plan` först.

Arbetssätt:

1. **Följ planen** punkt för punkt. Bocka av i `tasks/todo.md` allteftersom.
2. **Förklara varje steg** kort på hög nivå medan du går.
3. **Delegera enligt Modellstrategin**: rutin-UI/Tailwind/tester → `rutinarbete`; docs → `dokumentation`; bokföringslogik/moms/SRU/SIE/DB-migrationer → huvudsessionen själv.
4. **Verifiering innan klart (obligatorisk):**
   - [ ] `npm run test` — alla gröna
   - [ ] `npm run build` — rent bygge
   - [ ] Inga regressioner
   - [ ] Edge-cases hanterade
   - [ ] Diff granskad mot `main`
5. **Dokumentera resultat**: lägg en kort review-sektion i `tasks/todo.md`. Uppdatera `tasks/lessons.md` om användaren korrigerat dig.

Faller ett verifieringssteg: gå tillbaka till planering, patcha inte runt det. Commit + push till `main` först när allt är grönt (deploy-regler i CLAUDE.md).
