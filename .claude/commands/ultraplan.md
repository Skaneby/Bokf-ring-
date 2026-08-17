---
description: Djupplanering med utökat tänkande — resonera igenom minst 3 angreppssätt och skriv en detaljerad spec innan någon kod skrivs.
argument-hint: [vad som ska planeras]
---

Använd effort-nivå **xhigh**. Detta är ren planering — skriv INGEN kod ännu.

Uppgift att planera: $ARGUMENTS

Läs `CLAUDE.md` (arkitektur + fallgropar) och `tasks/lessons.md` (tidigare misstag) innan du börjar.

Gör så här:

1. **Förstå problemet fullt ut.** Utforska relevant kod (delegera research till subagenter om det spänner över flera filer). Ställ förtydligande frågor bara om något är genuint tvetydigt och blockerar planen.
2. **Resonera igenom minst 3 angreppssätt.** Visa trade-offs explicit — enkelhet, risk, påverkansyta, framtida underhåll. Hoppa inte till den första lösningen.
3. **Rekommendera ett** och motivera varför det vinner mot de andra.
4. **Skriv en detaljerad spec till `tasks/todo.md`**: checkbara punkter, berörda filer, verifieringssteg, edge-cases och risker. Specen ska vara så tydlig att implementationen blir mekanisk.
5. **Gå in i plan-läge** och stäm av planen med användaren innan implementation.

Kritiskt för denna kodbas:
- Delegera ALDRIG bokföringslogik, moms, SRU/SIE-serialisering eller DB-migrationer — huvudsessionen planerar och gör det själv.
- Om något går sidledes under planeringen: STANNA och planera om, tryck inte vidare.
