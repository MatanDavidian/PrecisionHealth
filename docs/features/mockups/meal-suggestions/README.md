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
