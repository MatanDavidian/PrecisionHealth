/**
 * Time.
 *
 * DECISION 1: every point in time is stored as a UTC instant.
 * DECISION 2: every record also stores the IANA timezone that was in effect
 *             where it happened.
 *
 * The second is the part UTC alone cannot cover. "Which day does this belong
 * to" is a question about the user's local calendar, not about UTC, and the
 * answer must stay stable forever — including for records created in a
 * timezone the user no longer lives in. Storing the zone alongside the instant
 * is what makes a day's totals reproducible after travel, after a move, and on
 * a server that has no idea where the user is standing.
 *
 * Deriving the local date in the UI instead would give a different answer per
 * viewing device, and would make server-side goal evaluation impossible.
 */

/** ISO-8601 instant, always UTC, always with the trailing Z. */
export type Instant = string

/** ISO-8601 local calendar date (YYYY-MM-DD). Never carries a time. */
export type CalendarDate = string

/** IANA zone name, e.g. 'Asia/Jerusalem'. Never a raw UTC offset — offsets change with DST. */
export type IanaZone = string

/**
 * The hour a health day starts, in local time.
 *
 * 0 = local midnight, which is what Garmin, Apple Health and most nutrition
 * trackers use, so imported daily totals line up with ours without a fudge.
 * A 01:00 meal therefore belongs to the day that just started, not the one
 * that just ended.
 *
 * Some users would rather a late-night snack counted toward the previous day.
 * That is a real preference and it becomes a per-user setting later; until
 * then it is one constant in one file, deliberately not scattered across
 * queries.
 */
export const DAY_BOUNDARY_HOUR = 0

/** Time semantics differ per record and the model has to say which applies. */
export type TimeSemantics =
  /** A measurement taken at a moment: weight, an HRV reading, a meal. */
  | { kind: 'instant'; at: Instant; zone: IanaZone }
  /** Something with a start and an end: sleep, a workout. */
  | { kind: 'interval'; start: Instant; end: Instant; zone: IanaZone }
  /** An aggregate that belongs to a calendar day: steps, daily protein total. */
  | { kind: 'daily'; date: CalendarDate; zone: IanaZone }

const partsIn = (instant: Instant, zone: IanaZone) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}` as CalendarDate,
    hour: Number(parts.hour),
  }
}

const shiftDate = (date: CalendarDate, days: number): CalendarDate => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10) as CalendarDate
}

/** The local calendar day an instant falls in, honouring the day boundary. */
export function dayKey(
  instant: Instant,
  zone: IanaZone,
  boundaryHour: number = DAY_BOUNDARY_HOUR,
): CalendarDate {
  const { date, hour } = partsIn(instant, zone)
  return hour < boundaryHour ? shiftDate(date, -1) : date
}

/**
 * Which end of an interval decides its day.
 *
 * Sleep is attributed to the day you WAKE UP, matching Garmin, Oura and Whoop —
 * "last night's sleep" is part of today's recovery, not yesterday's. Workouts
 * and everything else are attributed to when they started.
 */
export type DayAnchor = 'START' | 'END'

export function dayKeyOf(time: TimeSemantics, anchor: DayAnchor = 'START'): CalendarDate {
  switch (time.kind) {
    case 'daily':
      return time.date
    case 'instant':
      return dayKey(time.at, time.zone)
    case 'interval':
      return dayKey(anchor === 'END' ? time.end : time.start, time.zone)
  }
}

/** Seconds between the ends of an interval. */
export function durationSeconds(time: Extract<TimeSemantics, { kind: 'interval' }>): number {
  return (new Date(time.end).getTime() - new Date(time.start).getTime()) / 1000
}

/** Milliseconds the zone is ahead of UTC at a given instant (DST-aware). */
function offsetMsAt(utcMs: number, zone: IanaZone): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return asUtc - utcMs
}

/**
 * Local wall-clock time in a zone -> the UTC instant it names.
 *
 * The inverse of `dayKey`, and the conversion every write needs: a user types
 * "13:05" and means 13:05 where they are, which is a different instant in
 * every zone and shifts twice a year with DST.
 *
 * Resolved in two passes because the offset depends on the instant we are
 * trying to find. The second pass corrects the first, which is exact except
 * inside the one ambiguous hour when clocks go back — there, the earlier of the
 * two possible instants wins.
 */
export function zonedTimeToUtc(date: CalendarDate, timeOfDay: string, zone: IanaZone): Instant {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = timeOfDay.split(':').map(Number)
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const corrected = naive - offsetMsAt(naive, zone)
  const refined = naive - offsetMsAt(corrected, zone)
  return new Date(refined).toISOString()
}

/** Shift a calendar date by whole days. */
export const addDays = (date: CalendarDate, days: number): CalendarDate => shiftDate(date, days)
