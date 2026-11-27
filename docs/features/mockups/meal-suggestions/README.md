# Mock-ups — what to eat now

For [`../../meal-suggestions.md`](../../meal-suggestions.md). Drawn 2026-11-26
as HTML in the app's colours and fonts (`source/make.py` writes the pages,
`source/shoot.mjs` renders them at 390 px); not an interactive canvas.

| | |
| --- | --- |
| ![](01-ask.png) **1. Ask** — the line under Today's targets, and the button | ![](02-ask-with-note.png) **2. With a note** — "quick, no cooking…" |
| ![](03-thinking.png) **3. Thinking** | ![](04-suggestions.png) **4. Three suggestions**, best fit first |
| ![](05-logged.png) **5. Logged**, the targets move, Undo | ![](08-other-states.png) **8. Other states** |
| ![](06-he-ask.png) **6. Hebrew, ask** | ![](07-he-suggestions.png) **7. Hebrew, suggestions** |

**As built** (2026-11-26), on the sample day: on target for calories, 17 g of
protein short, so the suggestions are small. The test model's answers, not a
real model's. Each suggestion also has **Take a photo** (the owner's addition).

| | |
| --- | --- |
| ![](09-built-ask.png) **9. Ask** | ![](10-built-suggestions.png) **10. Suggestions** |
| ![](11-built-he-ask.png) **11. Hebrew, ask** | ![](12-built-he-suggestions.png) **12. Hebrew, suggestions** |

**Second round** (2026-11-26): over today but short of protein, the week
decides. Drawn first:

| | |
| --- | --- |
| ![](13-over-protein-ask.png) **13. Room in the week: a protein snack** | ![](14-over-protein-suggestions.png) **14. The protein snacks** |
| ![](15-over-stop.png) **15. No room: better to stop** | ![](16-he-over-protein-ask.png) **16. Hebrew, protein snack** |
| ![](17-he-over-stop.png) **17. Hebrew, stop** | |

And as built, on the sample day (20 kcal left, 17 g of protein short, the
week 190 under), then with a 1,200 kcal dinner added:

| | |
| --- | --- |
| ![](18-built-protein-ask.png) **18. Protein snack** | ![](19-built-protein-suggestions.png) **19. The snacks**, up to 190 kcal |
| ![](20-built-stop.png) **20. Stop** | ![](21-built-he-stop.png) **21. Hebrew, stop** |

**Third round, drawn** (2026-11-26): the week's protein, fat and carbs, and
what else should shape a suggestion.

| | |
| --- | --- |
| ![](22-week-macros.png) **22. The week's macros** decide with the calories | ![](23-stop-protein-ahead.png) **23. Protein ahead for the week**: stop |
| ![](24-meals-to-come-and-training.png) **24. Room kept for the usual dinner, and today's training** | ![](25-food-preferences.png) **25. Food preferences**, in Settings → Goals |
| ![](26-he-week-macros.png) **26. Hebrew, the week** | ![](27-he-meals-to-come-and-training.png) **27. Hebrew, dinner to come and training** |
| ![](28-he-food-preferences.png) **28. Hebrew, food preferences** | |

As built (all four chosen), on the sample day:

| | |
| --- | --- |
| ![](29-built-week-and-training.png) **29. The week's table and today's training** | ![](30-built-food-preferences.png) **30. Food preferences** |
| ![](31-built-he-week-and-training.png) **31. Hebrew** | ![](32-built-he-food-preferences.png) **32. Hebrew, food preferences** |

**Phase 1 of the precision design, as built** (2026-11-27,
[`../../meal-suggestions-precision.md`](../../meal-suggestions-precision.md)):

| | |
| --- | --- |
| ![](33-built-thursday-within-plan.png) **33. The owner's Thursday: +89, within plan range, and why** | ![](34-built-thursday-light-snack.png) **34. The optional light snack, at most 120** |
| ![](35-built-possibly-incomplete-day.png) **35. A day possibly incomplete, not counted until answered** | ![](36-built-missing-lunch-question.png) **36. Asked first: no lunch logged** |
| ![](37-built-he-possibly-incomplete-day.png) **37. Hebrew** | |
