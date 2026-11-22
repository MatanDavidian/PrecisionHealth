/**
 * Who is due a reminder, and what it says (docs/features/reminders.md).
 *
 * Pure, with no imports: the edge function runs it, and the Node test suite
 * pins it (src/__tests__/reminderRules.test.ts), clock and zones included.
 */

export type ReminderKind = 'MEAL' | 'WATCH'

/** How long after its time a reminder may still go, if the schedule ran late. Later than this, it is skipped. */
export const REMINDER_WINDOW_MINUTES = 120

/** Days without a sync before the watch reminder, and between two of them. */
export const WATCH_SILENT_DAYS = 3

/** The evening and the night after it: 16:00 to 04:00, on the quarter hour. */
export const isReminderTime = (time: unknown): time is string =>
  typeof time === 'string' &&
  /^([01][0-9]|2[0-3]):(00|15|30|45)$/.test(time) &&
  (time >= '16:00' || time <= '04:00')

export const isZone = (zone: unknown): zone is string => {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The calendar date and the minute of the day, on a clock in `zone`. */
export function localClock(now: Date, zone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

const shiftDate = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The day a reminder at `time` is due for, now, or undefined when none is.
 *
 * A reminder belongs to an evening: at 22:30 to that day; at 01:00 to the
 * day before, whose night it is. It is due from its time until
 * REMINDER_WINDOW_MINUTES after, so a schedule running late still sends it,
 * and a schedule down all night does not wake anyone at seven.
 */
export function dueDay(time: string, zone: string, now: Date, windowMinutes = REMINDER_WINDOW_MINUTES): string | undefined {
  const [hours, minutes] = time.split(':').map(Number)
  const atMinute = hours * 60 + minutes
  // Minutes from the start of the reminder's own day: past midnight is the next day's early hours.
  const offset = atMinute >= 16 * 60 ? atMinute : atMinute + 24 * 60
  const clock = localClock(now, zone)
  for (const daysBack of [0, 1]) {
    const sinceDayStart = clock.minutes + daysBack * 24 * 60
    if (sinceDayStart >= offset && sinceDayStart < offset + windowMinutes) return shiftDate(clock.date, -daysBack)
  }
  return undefined
}

/**
 * Whether anything was logged that day: any meal whose newest version is not
 * a deletion. A day set in one tap (quick-set) counts: it has been dealt with.
 */
export function dayHasMeal(rows: readonly { data: { id?: string; version?: number; retracted?: boolean } }[]): boolean {
  const newest = new Map<string, { version: number; retracted: boolean }>()
  for (const { data } of rows) {
    const id = data.id ?? ''
    const version = data.version ?? 1
    const held = newest.get(id)
    if (!held || version > held.version) newest.set(id, { version, retracted: data.retracted === true })
  }
  return [...newest.values()].some((meal) => !meal.retracted)
}

/**
 * Whether a watch has gone quiet: its newest sync, or its connection if it
 * never synced, at least WATCH_SILENT_DAYS ago. With several watches, the
 * newest of them counts: one still syncing means the days are arriving.
 */
export function watchSilent(
  tokens: readonly { last_used_at: string | null; created_at: string }[],
  now: Date,
  days = WATCH_SILENT_DAYS,
): boolean {
  if (tokens.length === 0) return false
  const newest = Math.max(...tokens.map((t) => Date.parse(t.last_used_at ?? t.created_at)))
  return now.getTime() - newest >= days * 24 * 60 * 60 * 1000
}

export type MessageKind = ReminderKind | 'TEST'

export interface ReminderMessage {
  title: string
  body: string
  /** Where tapping it opens. */
  url: string
  /** One per kind on the phone: a new one replaces an unread old one. */
  tag: string
  /**
   * Buttons, for platforms that show them (Chrome: two at most; iPhone: none).
   * The service worker shows as many as the platform allows, in this order.
   */
  actions?: { action: string; title: string }[]
  /** Where each button opens, by its action. */
  actionUrls?: Record<string, string>
}

/**
 * The words. Nothing about what anyone ate or weighs: the text passes
 * through the push service's hands, and sits on a lock screen.
 */
export function reminderMessage(kind: MessageKind, lang: string | null | undefined): ReminderMessage {
  const he = lang === 'he'
  switch (kind) {
    case 'MEAL':
      return {
        title: 'Vimetry',
        body: he
          ? 'הגיע הזמן לרשום את היום. אפשר להוסיף ארוחות, או לקבוע את היום בהקשה אחת.'
          : 'Time to log today. Add your meals, or set the day in one tap.',
        url: '/today',
        tag: 'vimetry-meal',
      }
    case 'WATCH':
      return {
        title: 'Vimetry',
        body: he
          ? 'השעון לא שלח נתונים כבר 3 ימים. פתחו את Vimetry בשעון, ובדקו שהוא מחובר לטלפון.'
          : 'Your watch has not synced for 3 days. Open Vimetry on the watch, and check it is connected to your phone.',
        // Where the watch connection lives.
        url: '/settings?tab=account',
        tag: 'vimetry-watch',
      }
    case 'TEST':
      return {
        title: 'Vimetry',
        body: he ? 'כך תיראה תזכורת.' : 'This is how a reminder will look.',
        url: '/settings?tab=you',
        tag: 'vimetry-test',
      }
  }
}

// ------------------------------------------------------- meal reminders ---
// docs/features/meal-reminders.md

export type MealReminderSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER'
export const MEAL_REMINDER_SLOTS: readonly MealReminderSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER']

/** Each meal's window, inclusive, in quarter hours. */
export const SLOT_WINDOWS: Record<MealReminderSlot, readonly [string, string]> = {
  BREAKFAST: ['05:00', '11:45'],
  LUNCH: ['11:00', '16:45'],
  DINNER: ['17:00', '23:45'],
}

/** A meal reminder is about now: 90 minutes late is still lunch, three hours late is not. */
export const SLOT_REMINDER_WINDOW_MINUTES = 90

export const isSlotTime = (slot: MealReminderSlot, time: unknown): time is string =>
  typeof time === 'string' &&
  /^([01][0-9]|2[0-3]):(00|15|30|45)$/.test(time) &&
  time >= SLOT_WINDOWS[slot][0] &&
  time <= SLOT_WINDOWS[slot][1]

/** The day a meal reminder at `time` is due for, now: the same day only, never the night after. */
export function dueToday(time: string, zone: string, now: Date, windowMinutes = SLOT_REMINDER_WINDOW_MINUTES): string | undefined {
  const [hours, minutes] = time.split(':').map(Number)
  const at = hours * 60 + minutes
  const clock = localClock(now, zone)
  return clock.minutes >= at && clock.minutes < at + windowMinutes ? clock.date : undefined
}

/**
 * Whether this meal is already logged that day: a live meal in the slot, or
 * a day set in one tap (which stands in for every meal of it).
 */
export function slotLogged(
  rows: readonly { data: { id?: string; version?: number; retracted?: boolean; slot?: string; provenance?: { source?: string } } }[],
  slot: MealReminderSlot,
): boolean {
  const newest = new Map<string, (typeof rows)[number]['data']>()
  for (const { data } of rows) {
    const id = data.id ?? ''
    const held = newest.get(id)
    if (!held || (data.version ?? 1) > (held.version ?? 1)) newest.set(id, data)
  }
  return [...newest.values()].some(
    (meal) => meal.retracted !== true && (meal.slot === slot || meal.provenance?.source === 'PATTERN_FILL'),
  )
}

/** A usual meal as the app saved it for the buttons. */
export interface UsualChoice {
  /** The meal's signature (its foods), which the app looks up again. */
  key: string
  name: string
  kcal: number
}

const SLOT_WORDS: Record<MealReminderSlot, { en: string; he: string }> = {
  BREAKFAST: { en: 'Breakfast?', he: 'ארוחת בוקר?' },
  LUNCH: { en: 'Lunch?', he: 'ארוחת צהריים?' },
  DINNER: { en: 'Dinner?', he: 'ארוחת ערב?' },
}

const shorten = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

/**
 * A meal reminder: the meal's name as the title, the usual meal as a button
 * that logs it in one tap, "Something else" for the quick sheet. Without a
 * usual meal yet, no buttons: a tap opens the sheet.
 *
 * `once` marks this reminder, so a button tapped twice, or a page reloaded,
 * logs one meal and not two.
 */
export function slotMessage(
  slot: MealReminderSlot,
  lang: string | null | undefined,
  usuals: readonly UsualChoice[] | undefined,
  day: string,
): ReminderMessage {
  const he = lang === 'he'
  const sheet = `/quick?slot=${slot}`
  const top = usuals?.find((u) => typeof u.key === 'string' && typeof u.name === 'string' && u.name.length > 0)
  const message: ReminderMessage = {
    title: SLOT_WORDS[slot][he ? 'he' : 'en'],
    body: top
      ? he
        ? 'אפשר לרשום בהקשה אחת.'
        : 'Log it in one tap.'
      : he
        ? 'הקישו כדי לרשום.'
        : 'Tap to log it.',
    url: sheet,
    tag: `vimetry-${slot.toLowerCase()}`,
  }
  if (!top) return message
  return {
    ...message,
    actions: [
      { action: 'usual', title: shorten(top.name, 40) },
      { action: 'other', title: he ? 'משהו אחר' : 'Something else' },
    ],
    actionUrls: {
      usual: `${sheet}&log=${encodeURIComponent(top.key)}&once=${day}-${slot}`,
      other: sheet,
    },
  }
}
