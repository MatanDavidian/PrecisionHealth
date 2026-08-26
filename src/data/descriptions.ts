/**
 * The last few meals you described in words.
 *
 * Device-local and deliberately not a record. What you typed is already kept
 * properly — the AIInference behind the estimate holds it, and that is the
 * audit trail. This is only a convenience so the sentence you write every
 * Tuesday is one tap away, and losing it costs nothing but retyping.
 *
 * localStorage rather than the store for the same reason `OneTimeNotice` uses
 * it: it is a fact about this browser, it must not sync between devices as if
 * it were health data, and private browsing may simply refuse it.
 */
const KEY = 'recent-descriptions'

/** Enough to cover a habit, short enough to stay a row of chips. */
export const RECENT_DESCRIPTIONS = 5

/** Longer than this is a diary entry, not a meal. Matches the prompt's cap. */
const MAX_LENGTH = 500

export function readRecentDescriptions(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, RECENT_DESCRIPTIONS)
      : []
  } catch {
    return []
  }
}

/**
 * Remembers a description, newest first, without duplicates.
 *
 * Case- and space-insensitive on the comparison so "Two eggs " does not sit
 * next to "two eggs"; the text is kept exactly as typed, because that is what
 * gets sent back to the model.
 */
export function rememberDescription(description: string): string[] {
  const text = description.trim().slice(0, MAX_LENGTH)
  if (!text) return readRecentDescriptions()

  const key = text.toLowerCase().replace(/\s+/g, ' ')
  const next = [
    text,
    ...readRecentDescriptions().filter((entry) => entry.toLowerCase().replace(/\s+/g, ' ') !== key),
  ].slice(0, RECENT_DESCRIPTIONS)

  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private browsing, or a full quota. The suggestion list stays as it was.
  }
  return next
}

export function forgetDescription(description: string): string[] {
  const key = description.trim().toLowerCase().replace(/\s+/g, ' ')
  const next = readRecentDescriptions().filter(
    (entry) => entry.toLowerCase().replace(/\s+/g, ' ') !== key,
  )
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // As above: the list simply keeps what it had.
  }
  return next
}
