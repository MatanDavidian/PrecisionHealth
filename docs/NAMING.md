# E3 — the name, and the address

**Status: research and options. The decision is yours; nothing here has been acted on.**

The code side is already done and does not depend on the answer: the product
name now lives in [`src/brand.ts`](../src/brand.ts) and nowhere else, and
`vite.config.ts` fills the `<title>` from it. **Renaming is one edit.**

---

## The problem as it stands

The app says **Timeline** on screen. The repository says **PrecisionHealth**.
Two names for one product is the state a rename starts from, and both have a
problem beyond that:

- **Timeline** is a common noun in the software vocabulary — Facebook,
  Twitter, project tools, video editors. It is effectively unregisterable as a
  trademark for software and it is unsearchable. Someone who hears the name at
  the gym cannot find the app.
- **PrecisionHealth** is a category term. "Precision health" is an entire
  field, with conferences and journals and existing companies. Same problem,
  plus it sounds like a clinic.

Both are *descriptive*, which is exactly the category trademark law protects
least. That matters more than it sounds: without a defensible name you cannot
stop a competitor using it, and an app store can be made to take your listing
down on someone else's word.

---

## What I actually checked

Availability, by RDAP — the registries' own API, so these are real answers and
not a guess. Checked on 2026-09-04; **re-check before buying**, availability
moves.

| Domain | Status |
| --- | --- |
| `mesila.app` | **available** |
| `mesila.io` | **available** |
| `mesila.health` | **available** |
| `mesila.co` | **available** |
| `mesila.com` | taken |
| `kavim.app` | **available** |
| `kavim.io` | **available** |
| `roshem.app` | **available** |
| `yoman.health` | **available** |
| `truthly.health` | **available** |
| `throughline.*`, `baseline.*`, `bodyledger.com`, `honestplate.com`, `plainly.health` | taken |

`.co.il` could not be checked from here — the Israeli registry does not answer
standard whois. Check at [isoc.org.il](https://isoc.org.il) directly if an
Israel-first launch matters.

**Be honest about the order this happened in:** I searched for *available*
names first and then asked which of them meant something useful. That is the
right way round for a domain and the wrong way round for a brand, so treat the
list as a starting point rather than a recommendation with conviction behind it.

---

## מסילה — what it means

**mesila** (mə-see-LAH), from the root ס־ל־ל, "to pave".

- Modern Hebrew: **a railway track**. מסילת ברזל, "track of iron", is the
  railway; מסילה alone is the track itself.
- Older and biblical: **a made way** — a road built up and cleared, as opposed
  to a path worn by walking. Isaiah's "make straight in the desert a highway"
  is a מסילה.
- Best-known literary use: **מסילת ישרים**, *Path of the Upright*, Luzzatto's
  1740 ethics book about improving yourself in deliberate, ordered stages.

### Why it fits this app

The architecture's central commitment is that **the record is continuous and
nothing is overwritten** — append-only, versions kept, conflicts surfaced
rather than resolved away. A track is exactly that: laid down once, continuous,
and the thing you stay on. "Am I on track?" is also, literally, the question
the week view answers.

The Luzzatto sense is closer still — steady progress by small deliberate
stages, which is what a nutrition and training log is actually for.

### Why it might not

- **The religious association is real.** מסילת ישרים is well enough known that
  some Israeli readers will hear a faint yeshiva echo. Most will just hear
  "railway". Whether that is a problem is a judgement about your audience that
  I cannot make for you.
- **Israel Railways** owns the everyday association in Hebrew. "מסילה" may
  read as infrastructure rather than as personal.
- **Meaningless in English.** Arbitrary names are the strongest trademarks and
  the most expensive marketing — nobody guesses what it does, so every
  impression has to teach it.
- Three syllables, and English speakers will stress it wrongly at first.

---

## My recommendation

**Decide the market before the name**, because it changes the answer:

- **Israel first** → a Hebrew name is a genuine advantage: distinctive at home,
  arbitrary and defensible abroad. `mesila.app` is the strongest of the set.
- **EU/US first** → a Hebrew name costs you the one thing a small product
  cannot buy, which is being understood in three seconds. Then it is worth
  spending real time on an English name rather than picking from what happened
  to be free.

Either way:

1. **Do not ship as Timeline or PrecisionHealth.** Both are descriptive and
   neither is defensible.
2. **Search the trademark registers before buying anything** — Israeli
   [Patent Office](https://www.gov.il/en/departments/israel_patent_office),
   EUIPO, USPTO — in class 9 (software) and class 44 (health services). A free
   domain is not a free name.
3. **Buy the `.com` if you can get it**, or accept `.app` and be consistent.
   `.health` reads as clinical, which this app deliberately is not.
4. **Get an address on the domain** (`hello@`, `privacy@`) before the privacy
   policy is published — it names a contact, and a gmail address there
   undercuts everything the document says about taking custody of health data.

---

## What this blocks

`docs/PHASE-1.md` has E3 gating **E4** (the Connect IQ Store listing) and
**E5** (the privacy policy, which must name a legal entity and a contact).
Both are otherwise ready. The privacy policy is drafted and shipping with
`[UNDECIDED: …]` markers exactly where this decision belongs.
