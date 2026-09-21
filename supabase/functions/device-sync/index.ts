/**
 * Observations from a device that cannot sign in.
 *
 * A watch has no browser and no way to finish an OAuth round trip on a 46mm
 * screen, so it carries a bearer token instead. This function is the only
 * place that token is worth anything, and it is deliberately the narrowest
 * surface in the project:
 *
 *   - it WRITES observations and returns a count
 *   - it has no path that returns a record
 *
 * A stolen watch token can therefore add noise to a day, which is visible and
 * recoverable, and cannot read a history, which would not be.
 *
 * `verify_jwt` must be off for this function: the caller has no JWT. Auth is
 * done below against `device_tokens`, hashed.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  keepRecentDays,
  MAX_DEVICE_SYNC_DAYS,
  MAX_DEVICE_SYNC_ENTRIES,
  resolveDeviceZone,
} from '../_shared/deviceSync.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-device-token, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/**
 * The shortest gap allowed between two syncs from one device.
 *
 * Not a security boundary — a leaked token is a leaked token — but a bound on
 * how fast one can write. The watch syncs on open (throttled to 30 minutes)
 * and once a day in the background, so this never touches normal use.
 */
const MIN_SYNC_SECONDS = 60
/**
 * The largest plausible value per code.
 *
 * One ceiling for everything meant a stress score of 19,000 was accepted as
 * readily as a day's calories. These are generous — the job is to reject
 * nonsense and attacks, not to second-guess a device — but a value outside a
 * metric's own scale is not a reading.
 */
const MAX_VALUE: Record<string, number> = {
  TOTAL_ENERGY: 20000,
  ACTIVE_ENERGY: 20000,
  STEPS: 200000,
  DISTANCE: 500000,
  RESTING_HEART_RATE: 250,
  RESPIRATION_RATE: 80,
  STRESS: 100,
  VO2_MAX: 100,
}

/**
 * Codes a device may write, and the canonical unit each is stored in (D8).
 *
 * The two lists are one object so they cannot drift: a code with no unit
 * cannot be accepted, which is what stops a value being stored unbranded.
 *
 * ACTIVE_MINUTES was in the earlier allowlist and is gone. The domain has no
 * such code, so accepting it wrote observations the app could never read back —
 * a row that exists and means nothing is worse than a rejection.
 */
const UNIT: Record<string, string> = {
  // Accumulating over a day: only completed days are meaningful.
  TOTAL_ENERGY: 'kcal',
  ACTIVE_ENERGY: 'kcal',
  STEPS: 'count',
  DISTANCE: 'm',
  // Point measurements: today's value is simply today's value.
  RESTING_HEART_RATE: 'bpm',
  RESPIRATION_RATE: 'bpm',
  STRESS: 'score',
  VO2_MAX: 'ml/kg/min',
}
const ALLOWED = new Set(Object.keys(UNIT))

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  /*
    The token may arrive either way. A watch's HTTP client is not always free
    to set arbitrary headers, and Authorization is the one every client can
    send; x-device-token is accepted so the Supabase gateway's own use of
    Authorization never collides with ours.
  */
  const header = request.headers.get('x-device-token') ??
    (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const presented = header.trim()
  if (presented.length < 32) return json({ error: 'no_device_token' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Looked up by hash, so the plaintext is never compared against anything
  // stored — and a dump of this table yields nothing that works.
  const { data: token } = await admin
    .from('device_tokens')
    .select('id, user_id, revoked_at, last_used_at')
    .eq('token_hash', await sha256Hex(presented))
    .maybeSingle()

  if (!token || token.revoked_at) return json({ error: 'bad_device_token' }, 401)

  /*
    One sync a minute per device, at most.

    This endpoint is the only one anything on the internet can reach holding
    nothing but a bearer token, and every accepted request writes rows. The
    watch already throttles itself to once per half hour, and the background
    job runs daily, so a minute is generous by two orders of magnitude — it
    exists for the two cases the client cannot be trusted to prevent: a build
    that loops, and a token that has leaked.

    Measured from `last_used_at`, which is only stamped after a sync SUCCEEDS,
    so a retry after a failure is never throttled. 429 with Retry-After,
    because the honest answer is "later", not "no".
  */
  const lastUsed = token.last_used_at ? Date.parse(token.last_used_at as string) : 0
  const sinceLast = (Date.now() - lastUsed) / 1000
  if (Number.isFinite(sinceLast) && sinceLast < MIN_SYNC_SECONDS) {
    const wait = Math.ceil(MIN_SYNC_SECONDS - sinceLast)
    return new Response(JSON.stringify({ error: 'too_soon', retryAfter: wait }), {
      status: 429,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': String(wait) },
    })
  }

  let body: { zone?: unknown; observations?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  /*
    The zone the watch cannot name for itself.

    Connect IQ exposes a UTC offset, never an IANA name, so the watch sends
    the sentinel "device" and this resolves it against the person's own
    profile — the only place an authoritative zone name exists. Reading it
    here rather than trusting whatever the request claims means a forged zone
    string cannot land on someone else's observations.
  */
  const { data: profileRow } = await admin
    .from('profiles')
    .select('data')
    .eq('user_id', token.user_id)
    .maybeSingle()
  const zone = resolveDeviceZone(
    body.zone,
    (profileRow?.data as { timezone?: string } | null)?.timezone,
  )

  const rawIncoming = Array.isArray(body.observations)
    ? body.observations.slice(0, MAX_DEVICE_SYNC_ENTRIES)
    : []
  if (rawIncoming.length === 0) return json({ error: 'nothing_to_write' }, 400)

  const rejected: string[] = []
  const valid: { day: string; code: string; value: number }[] = []

  for (const entry of rawIncoming) {
    if (!entry || typeof entry !== 'object') continue
    const { day, code, value } = entry as Record<string, unknown>

    if (!isDay(day) || typeof code !== 'string' || !ALLOWED.has(code)) {
      rejected.push(String(code ?? 'unknown'))
      continue
    }
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_VALUE[code]) {
      rejected.push(`${code}:${String(value)}`)
      continue
    }
    valid.push({ day, code, value: amount })
  }

  /*
    Bounded by DAYS, on the validated entries — never mid-day.

    `MAX_DAYS` used to slice the raw, unvalidated array of observations, which
    conflated a day count with an entry count: a full backlog (7 history days
    at up to 3 codes each, plus today's up to 4 point measurements) is 25
    entries, and the old slice(0, 14) cut off the oldest history days AND, on
    every single occasion, all of today's readings — silently, since a client
    only ever sees how many rows were written. Grouping by day first means a
    day's readings arrive together or are dropped together, and normal use
    (one or two unsent days) never approaches the cap at all.
  */
  const incoming = keepRecentDays(valid, MAX_DEVICE_SYNC_DAYS)

  const rows = incoming.map(({ day, code, value: amount }) => {
    /*
      Midday on the named day, in the resolved zone.

      The watch anchors its history at local midnight, and midnight is the one
      instant that lands on a different date depending on which way the zone is
      read. Midday has twelve hours of slack in both directions, so the record
      files under the day it was measured for whatever the reader does with it
      (D7).
    */
    const at = new Date(`${day}T12:00:00Z`).toISOString()
    const id = crypto.randomUUID()
    return {
      id,
      user_id: token.user_id,
      day,
      code,
      data: {
        id,
        userId: token.user_id,
        code,
        time: { kind: 'instant', at, zone },
        value: { value: amount, unit: UNIT[code] },
        /*
          RAW, from GARMIN. Precedence already decides what this means against
          a figure the person typed: kind dominates source, so a USER_CONFIRMED
          entry outranks this and the watch fills the days nobody typed. A gap
          wider than the code's tolerance surfaces as a conflict rather than
          overwriting anything (D6).
        */
        provenance: { source: 'GARMIN', kind: 'RAW', recordedAt: at },
      },
    }
  })

  if (rows.length === 0) return json({ error: 'nothing_valid', rejected }, 400)

  /*
    A device supersedes its own earlier readings rather than arguing with them.

    The same seven days arrive on every sync, so without this each one added a
    second row for a day already recorded. Two GARMIN readings of one day are
    not a disagreement worth showing anyone — they are the same device saying
    the same thing again, or correcting itself — and left as rivals they would
    raise a conflict against themselves the moment Garmin revised a figure.

    Only GARMIN rows are superseded. A value the person typed by hand outranks
    this one anyway (D6), and quietly retiring their entry because a watch
    reported later would be the device overruling the human.
  */
  const { data: existing } = await admin
    .from('observations')
    .select('id, day, code, data')
    .eq('user_id', token.user_id)
    .in('day', [...new Set(rows.map((r) => r.day))])
    .in('code', [...new Set(rows.map((r) => r.code))])

  const priorBySlot = new Map<string, string[]>()
  for (const row of existing ?? []) {
    if ((row.data as { provenance?: { source?: string } })?.provenance?.source !== 'GARMIN') continue
    const slot = `${row.day}:${row.code}`
    priorBySlot.set(slot, [...(priorBySlot.get(slot) ?? []), row.id])
  }

  for (const row of rows) {
    const prior = priorBySlot.get(`${row.day}:${row.code}`)
    if (prior?.length) {
      ;(row.data.provenance as Record<string, unknown>).supersedes = prior
    }
  }

  const { error } = await admin.from('observations').insert(rows)
  if (error) return json({ error: 'write_failed' }, 500)

  await admin
    .from('device_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', token.id)

  // A count, and what was thrown away. Never a record.
  return json({ written: rows.length, rejected, superseded: [...priorBySlot.values()].flat().length })
})
