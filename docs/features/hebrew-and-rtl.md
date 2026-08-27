# Feature spec — Hebrew, and running right to left

**One line:** the app speaks English or Hebrew, mirrors its layout to match,
and asks the model to answer in the same language — so the screen is not half
translated.

Status: **built** (Aug 2026).

---

## 1. Three things, not one

"Translate the app" is really three jobs, and only the first is the obvious one:

1. **The words** — every string the app says.
2. **The layout** — Hebrew runs right to left, so padding, margins, alignment
   and arrows all have a side, and the side flips.
3. **The model's words** — food names and assumptions come from OpenAI, not
   from the dictionary. Translating the buttons and leaving "Grilled chicken
   breast" in English would produce a screen that is Hebrew everywhere except
   the part the user actually came to read.

## 2. The dictionary

Hand-rolled, in keeping with a codebase that declines dependencies for jobs
this size. Two files:

- [`strings.ts`](../../src/ui/i18n/strings.ts) — English written first, with the
  dictionary type **derived from it**. Hebrew is therefore not allowed to be
  incomplete: adding an English string and forgetting the Hebrew one is a
  compile error, not a silently half-translated screen.
- [`translate.ts`](../../src/ui/i18n/translate.ts) — `translator(lang)`,
  `{placeholder}` filling, plural selection, browser detection. Deliberately
  free of React *and* of the data layer, so all of it is testable without a
  store or a rendered tree.
- [`index.tsx`](../../src/ui/i18n/index.tsx) — the provider, which is the thin
  part: it holds the choice and stamps `lang`/`dir` on the document.

Keys are dotted paths naming where a string lives (`estimate.question.send`),
not the English text — so rewording a sentence is a one-line change here rather
than a rename across the codebase.

**Plurals** are `{ one, other }`, chosen by `count`. Hebrew needs this for more
than the number: "לפני שבוע" (a week ago) against "לפני 3 שבועות" (3 weeks ago)
differ in wording, not just in digit.

A test asserts every Hebrew string keeps the placeholders its English original
has — a translation that drops `{count}` renders "meals" with no number, which
types cannot catch.

## 3. Where the choice lives

`AppSettings.language`, which is **device-local and excluded from sync** by the
same rule as the API key (D14, Q8). That is right: it is a preference about
this screen, not a fact about this person, and someone may well want Hebrew on
their phone and English on a shared laptop.

Unset means follow `navigator.language`; an explicit choice always wins. A
Hebrew speaker should not have to find a setting written in a language they did
not pick, which is also why the picker is the **first card** in Settings.

> **A bug worth recording.** The IndexedDB settings repository writes any key
> generically but *reads* from an explicit whitelist. `language` persisted
> perfectly and came back `undefined` every time, so the choice survived within
> a page and evaporated on navigation. Only driving the browser found it.

## 4. Running right to left

- The provider sets `document.documentElement.lang` and `dir`. Everything else
  follows from the browser.
- Direction-sensitive Tailwind classes were replaced with logical ones:
  `pl-`/`pr-` → `ps-`/`pe-`, `ml-`/`mr-` → `ms-`/`me-`, `text-left` →
  `text-start`, `left-`/`right-` → `start-`/`end-`, `border-r` → `border-e`.
  There were only about a dozen across the whole UI.
- The day-navigation chevrons carry `rtl:-scale-x-100`: "back" points the way
  the reader came from, and that is the other way round in Hebrew. The arrow
  follows the text, not the compass.

### Numbers are data, not prose

A run like `53P · 0C · 6F`, a clock time, or `64 g` is resolved by the bidi
algorithm against the paragraph direction — which in an RTL page moves the
pieces around the separators and renders `g 64`. Technically correct, and
unreadable.

These are pinned with a `.ltr-nums` class (`direction: ltr; unicode-bidi:
isolate`). Conversely, **model-authored text carries `dir="auto"`** — food
names, assumptions and the model's question — so each string is judged on its
own content. An English dish name inside a Hebrew page then reads correctly
instead of having its punctuation thrown to the wrong end.

### Fonts

Neither Fraunces nor Inter has Hebrew glyphs. Rather than swapping stacks by
language, **Frank Ruhl Libre** and **Heebo** were appended to the existing
`--font-display` and `--font-sans` stacks. A browser picks per character, so
Latin text keeps the intended face and Hebrew falls through — which is exactly
what a font stack is for.

## 5. The model answers in Hebrew too

`EstimateHints` gained `language`, and `languageRule()` appends one sentence to
whichever system prompt is in use.

The sentence is fussy on purpose:

> Reply in Hebrew: the "name", "assumptions" and "question" values must be
> written in Hebrew. The JSON keys, the field names and every number stay
> exactly as specified above — translate the words, never the shape.

Without that second half, a helpful model translates `"items"` and `"amountG"`
as well, and nothing parses. Values are prose for a person; keys are a contract
with a parser, and the two need saying apart.

It is appended for Hebrew only — for English the prompt already assumes it, and
an extra paragraph is tokens spent to say nothing.

## 6. The consequence worth flagging

`mealSignature` in [`usuals.ts`](../../src/domain/usuals.ts) identifies a
repeatable meal by its normalised item names. A user who switches language
mid-history therefore gets **two separate "usuals" for the same breakfast** —
"Porridge" and "דייסה" are different signatures.

This is a real limitation, recorded as **Q12** rather than papered over. The
fix is a language-independent food identity, which is the same work as the
food-database / barcode path already parked in the roadmap; inventing a
half-version of it now would be the wrong order.

## 7. Tests

- Both dictionaries carry the same keys, nothing is blank, and every Hebrew
  string keeps its English original's placeholders.
- Placeholder filling; singular and plural in both languages; an unknown
  placeholder stays visible rather than blanking.
- Browser detection: a Hebrew browser, a French one, and Hebrew as a
  second preference.
- `languageRule` says nothing for English and insists on the shape for Hebrew;
  it reaches the provider on the system message.
- In a browser: switching mirrors the document, every screen follows, the
  choice survives navigation, macro rows stay LTR inside an RTL page, and
  switching back needs no reload.
