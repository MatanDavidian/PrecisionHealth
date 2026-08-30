/**
 * What a selected pill looks like — written once.
 *
 * Three controls in this app are the same control wearing different widths:
 * the Log modes (Photo / Write / Again), the Day / Week switch on the
 * dashboard, and the language pills in Settings. They drifted apart precisely
 * because each was styled where it was used, so each picked slightly different
 * numbers and a slightly different grey, and together they stopped reading as
 * one idea.
 *
 * They are NOT one component. The Log modes are a real `tablist` pointing at a
 * panel; the Day/Week switch changes the whole view through the URL and is a
 * pair of pressed buttons; the language pills are a radio group. Forcing one
 * set of semantics onto all three would be a worse lie than three call sites
 * sharing a string. So the *look* is shared and the *meaning* stays local —
 * which is the same split the design file makes, where `mode()` and `seg()`
 * differ only in their padding.
 *
 * Selection is ink, never accent. Accent is reserved for the one action a
 * screen wants you to take; a row where every option glows orange until you
 * pick one has no way left to say "this is the button".
 */

/** Shared by every pill: shape, type size, and the transition. */
export const PILL = 'rounded-full text-[13.5px] transition-colors'

/** The chosen one. */
export const PILL_ON = 'bg-ink font-medium text-canvas'

/**
 * The others. `ink-soft` rather than `ink-muted` — an unselected option is
 * still a word you have to read to choose it.
 */
export const PILL_OFF = 'text-ink-soft hover:text-ink'
