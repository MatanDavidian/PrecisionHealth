/**
 * Pure logic behind `device-sync`, kept out of the handler so it can be
 * unit-tested directly — the same pattern `prompt.ts` already uses for
 * `costMicros`/`dailyBudgetMicros`. This file imports nothing Deno-specific,
 * so Vitest and the edge function both load it unmodified.
 */

/** getHistory() returns at most 7 days, most recent first (measured on a
 *  Forerunner 265, see garmin/README.md). A real payload from this watch is
 *  therefore at most 8 distinct days — the 7 history days plus today, whose
 *  point measurements ride along under today's own date. 14 keeps the
 *  original margin the comment on this constant always intended: double the
 *  real number, as headroom rather than as a limit that is expected to bind.
 */
export const MAX_DEVICE_SYNC_DAYS = 14

/**
 * A sanity bound on the RAW array, before anything is validated.
 *
 * Not the real limit — `keepRecentDays` below is — but a cheap rejection of a
 * payload that is not shaped like a watch at all (a spray of ten thousand fake
 * rows), applied before the more expensive per-entry validation runs.
 */
export const MAX_DEVICE_SYNC_ENTRIES = 64

/**
 * Keeps the most recent `maxDays` calendar days' worth of entries, in full.
 *
 * Replaces `body.observations.slice(0, MAX_DAYS)`, which read as "the most
 * DAYS a sync may carry" but was applied to the flat array of OBSERVATIONS —
 * up to three entries per accumulating day (TOTAL_ENERGY, STEPS, DISTANCE)
 * plus up to four same-day point measurements (STRESS, RESPIRATION_RATE,
 * RESTING_HEART_RATE, VO2_MAX) appended after every history day. A full
 * backlog is 7 × 3 + 4 = 25 entries, and slicing the first 14 cut off mid-day
 * — the oldest two-and-a-bit history days, AND, every single time, every one
 * of today's point measurements, because they sit at the very end of the
 * array. A day's readings never survive together or vanish together; this
 * groups by day FIRST and only ever drops whole days, oldest first.
 *
 * Ordinary use (one or two unsent days) was always far under the old cap and
 * never hit this — which is exactly why it took a real gap in syncing to
 * surface it, and why the symptom looked like "the days that come back after
 * a long gap are missing pieces" rather than a sync that fails outright.
 */
export function keepRecentDays<T extends { day: string }>(
  entries: readonly T[],
  maxDays: number = MAX_DEVICE_SYNC_DAYS,
): T[] {
  const days = [...new Set(entries.map((e) => e.day))].sort().reverse().slice(0, maxDays)
  const keep = new Set(days)
  return entries.filter((e) => keep.has(e.day))
}

/** What the client sends when it has an offset but no zone NAME to give. */
export const DEVICE_ZONE_SENTINEL = 'device'

/**
 * What zone to stamp on a device-sourced observation's `time`.
 *
 * Connect IQ exposes a UTC offset, never an IANA name — `System.getClockTime`
 * has no such field — so the watch cannot say "Asia/Jerusalem" for itself.
 * Guessing a zone FROM an offset would be wrong exactly when it matters most:
 * +02:00 is Israel Standard Time in winter and Eastern European Summer Time
 * in summer, among others, and only the name disambiguates daylight saving.
 *
 * So the watch sends the literal sentinel string "device" — not a zone, a
 * request to be told one — and this resolves it against the person's own
 * profile, which is the only place an authoritative IANA name exists. The
 * call site before this function existed accepted "device" itself as though
 * it were a valid zone (it is a string under 64 characters, so it passed the
 * only check that was there), silently storing an invalid `time.zone` on
 * every single device-sourced observation. Nothing currently reads that field
 * back on the server — the `day` column, computed independently on the watch,
 * is what reads and writes actually key on — so this was dormant rather than
 * visibly broken. It is still wrong, and it is exactly the kind of stored
 * value that turns into a real bug the moment something legitimately needs a
 * device observation's zone, which is the case D7 exists to make provision
 * for.
 */
export function resolveDeviceZone(requested: unknown, profileZone: string | undefined): string {
  if (requested === DEVICE_ZONE_SENTINEL) return profileZone && profileZone.length > 0 ? profileZone : 'UTC'
  return typeof requested === 'string' && requested.length > 0 && requested.length < 64
    ? requested
    : 'UTC'
}
