/**
 * What the product is called — the one place it is written down.
 *
 * It was in five: the sidebar wordmark, the card the model answers from, the
 * `<title>`, the package name, and the repository. Two of those were already
 * different words — the app says "Timeline" and the repository says
 * "PrecisionHealth" — which is the state a rename has to start from.
 *
 * E3 turns on a decision nobody has made yet, and this is the part that does
 * not have to wait for it: whatever the answer is, changing it should be one
 * edit rather than a search. `vite.config.ts` reads this file to fill in
 * `index.html`, so even the page title comes from here.
 *
 * Deliberately NOT a translated string. A product name is a name — it is the
 * same word in Hebrew, exactly as the two language buttons are each written in
 * their own language rather than translated.
 */
export const PRODUCT_NAME = 'Timeline'

/**
 * The one-line description, used where a name alone is not enough — the page
 * title, and later the Store listing and the link preview.
 */
export const PRODUCT_TAGLINE = 'Personal Health'

/** What the browser tab says. */
export const PAGE_TITLE = `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`
