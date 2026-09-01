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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-device-token, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** The most days a single sync may carry. getHistory() returns seven. */
const MAX_DAYS = 14
/** Beyond this a "day's calories" is not a reading, it is a bug or an attack. */
const MAX_KCAL = 20000

/** Codes a device is allowed to write. Not every code — only what a watch measures. */
const ALLOWED = new Set(['TOTAL_ENERGY', 'ACTIVE_ENERGY', 'STEPS', 'DISTANCE', 'ACTIVE_MINUTES'])

/** Canonical units, matching D8. The device sends plain numbers; we brand them here. */
const UNIT: Record<string, string> = {
  TOTAL_ENERGY: 'kcal',
  ACTIVE_ENERGY: 'kcal',
  STEPS: 'count',
  DISTANCE: 'm',
  ACTIVE_MINUTES: 's',
}

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
    .select('id, user_id, revoked_at')
    .eq('token_hash', await sha256Hex(presented))
    .maybeSingle()

  if (!token || token.revoked_at) return json({ error: 'bad_device_token' }, 401)

  let body: { zone?: unknown; observations?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  /*
    The zone comes from the request rather than being inferred, and it is the
    caller's job to send an IANA name. Connect IQ cannot supply one — it knows
    the offset, not the zone — so the watch sends what the PERSON's profile
    says, and an offset is never guessed into a zone here.
  */
  const zone = typeof body.zone === 'string' && body.zone.length < 64 ? body.zone : 'UTC'

  const incoming = Array.isArray(body.observations) ? body.observations.slice(0, MAX_DAYS) : []
  if (incoming.length === 0) return json({ error: 'nothing_to_write' }, 400)

  const rows = []
  const rejected: string[] = []

  for (const entry of incoming) {
    if (!entry || typeof entry !== 'object') continue
    const { day, code, value } = entry as Record<string, unknown>

    if (!isDay(day) || typeof code !== 'string' || !ALLOWED.has(code)) {
      rejected.push(String(code ?? 'unknown'))
      continue
    }
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_KCAL) {
      rejected.push(`${code}:${String(value)}`)
      continue
    }

    /*
      Midday on the named day, in the person's zone.

      The watch anchors its history at local midnight, and midnight is the one
      instant that lands on a different date depending on which way the zone is
      read. Midday has twelve hours of slack in both directions, so the record
      files under the day it was measured for whatever the reader does with it
      (D7).
    */
    const at = new Date(`${day}T12:00:00Z`).toISOString()
    const id = crypto.randomUUID()

    rows.push({
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
    })
  }

  if (rows.length === 0) return json({ error: 'nothing_valid', rejected }, 400)

  const { error } = await admin.from('observations').insert(rows)
  if (error) return json({ error: 'write_failed' }, 500)

  await admin
    .from('device_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', token.id)

  // A count, and what was thrown away. Never a record.
  return json({ written: rows.length, rejected })
})
