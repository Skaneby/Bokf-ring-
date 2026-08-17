---
description: Standardplanering — gå in i plan-läge och skriv en checkbar plan till tasks/todo.md innan implementation.
argument-hint: [vad som ska planeras]
---

Använd effort-nivå **high**. Skriv INGEN kod ännu — detta är planering.

Uppgift att planera: $ARGUMENTS

Läs `CLAUDE.md` (arkitektur + fallgropar) och `tasks/lessons.md` innan du börjar.

Gör så här:

1. **Utforska** relevant kod tills du förstår vad som krävs. Delegera bredare research till en subagent om det behövs.
2. **Skriv en checkbar plan till `tasks/todo.md`**: numrerade/checkbara punkter, berörda filer, verifieringssteg. Håll den så enkel som möjligt (Simplicity First, Minimal Impact).
3. **Gå in i plan-läge** och stäm av med användaren innan implementation.

Om uppgiften visar sig spänna över 5+ filer, kräva migration eller parallell utforskning: föreslå `/ultracode` (nämn ordet "workflow") istället för att köra den som en enkel plan.
