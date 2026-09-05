/**
 * What the product is called — the one place it is written down.
 *
 * It was in five: the sidebar wordmark, the card the model answers from, the
 * `<title>`, the package name, and the repository. Two of those disagreed —
 * the app said "Timeline" and the repository said "PrecisionHealth" — which is
 * the state a rename has to start from. This file is why the rename that
 * followed was one edit rather than a search. `vite.config.ts` reads it to fill
 * in `index.html`, so even the page title comes from here.
 *
 * Deliberately NOT a translated string. A product name is a name — it is the
 * same word in Hebrew, exactly as the two language buttons are each written in
 * their own language rather than translated.
 *
 * `-metry` is the process of measuring, as in telemetry and optometry, and
 * `vi-` is the Latin combining form behind vital and vivid. So the name means
 * "measuring life" rather than having a meaning attached afterwards.
 *
 * It is built the way real `-metry` words are built, which "Lifemetry" — the
 * previous choice — was not: geometry, telemetry, biometry and optometry all
 * join on a linking VOWEL, and "life" ends in a consonant. That is what made
 * the older name's stress ambiguous. This one also happens to rhyme with
 * symmetry, which is free help with spelling.
 *
 * See `docs/NAMING.md` for what was screened and what is still outstanding —
 * the trademark search in particular, which has not been done.
 */
export const PRODUCT_NAME = 'Vimetry'

/**
 * The one-line description, used where a name alone is not enough — the page
 * title, and later the Store listing and the link preview.
 */
export const PRODUCT_TAGLINE = 'Understand your patterns over time'

/** What the browser tab says. */
export const PAGE_TITLE = `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`
