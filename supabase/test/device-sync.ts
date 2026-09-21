/**
 * Does device-sync survive a long gap?
 *
 * The unit tests in src/data/__tests__/deviceSync.test.ts cover the extracted
 * pure functions. They cannot catch the bug that actually shipped, which was a
 * wiring bug: a cap named for days applied to a flat array of entries. That is
 * only visible end to end, so this runs the REAL handler against a stand-in
 * PostgREST and looks at the rows it tries to insert.
 *
 * A stub rather than a project, deliberately: a test that writes observations
 * needs an account to write them into, and the only accounts here are real.
 *
 *   deno run --allow-net --allow-env supabase/test/device-sync.ts
 */
Deno.env.set('SUPABASE_URL', 'http://localhost:8999')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-key')

const PROFILE_ZONE = 'Asia/Jerusalem'

/** Rows the observations table already holds, to exercise the supersede path. */
const PRIOR = [
  { id: 'prior-a', day: '2026-09-14', code: 'TOTAL_ENERGY', data: { provenance: { source: 'GARMIN' } } },
  { id: 'prior-b', day: '2026-09-14', code: 'STEPS', data: { provenance: { source: 'GARMIN' } } },
  { id: 'prior-c', day: '2026-09-20', code: 'STEPS', data: { provenance: { source: 'MANUAL' } } },
]

let inserted: Record<string, unknown>[] = []

const reply = (req: Request, rows: unknown[]) => {
  if (!(req.headers.get('accept') ?? '').includes('pgrst.object')) {
    return Response.json(rows)
  }
  if (rows.length === 0) return Response.json({ code: 'PGRST116' }, { status: 406 })
  return new Response(JSON.stringify(rows[0]), {
    headers: { 'Content-Type': 'application/vnd.pgrst.object+json' },
  })
}

const stub = Deno.serve({ port: 8999, onListen: () => {} }, async (req) => {
  const table = new URL(req.url).pathname.replace('/rest/v1/', '')
  if (req.method === 'POST' && table === 'observations') {
    inserted = await req.json()
    return reply(req, [])
  }
  if (req.method === 'PATCH') return reply(req, [])
  if (table === 'device_tokens') {
    return reply(req, [{ id: 'tok-1', user_id: 'user-1', revoked_at: null, last_used_at: null }])
  }
  if (table === 'profiles') return reply(req, [{ data: { timezone: PROFILE_ZONE } }])
  if (table === 'observations') return reply(req, PRIOR)
  return reply(req, [])
})

await import('../functions/device-sync/index.ts')

/**
 * What a watch sends after a week unsynced, rebuilt from garmin/source/Sync.mc:
 * completedDays() walks getHistory() newest-first pushing up to 3 entries per
 * day, then todaysMeasurements() appends 4 point measurements — last, which is
 * why a cap on entries beheaded exactly them.
 */
const DAYS = ['2026-09-20', '2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14']
const TODAY = '2026-09-21'
const observations = [
  ...DAYS.flatMap((day) => [
    { day, code: 'TOTAL_ENERGY', value: 2400 },
    { day, code: 'STEPS', value: 9000 },
    { day, code: 'DISTANCE', value: 7000 },
  ]),
  { day: TODAY, code: 'STRESS', value: 31 },
  { day: TODAY, code: 'RESPIRATION_RATE', value: 14 },
  { day: TODAY, code: 'RESTING_HEART_RATE', value: 52 },
  { day: TODAY, code: 'VO2_MAX', value: 48 },
]

const res = await fetch('http://localhost:8000/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-device-token': 'x'.repeat(48) },
  body: JSON.stringify({ zone: 'device', observations }),
})
const body = await res.json()

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failed++
}

const days = [...new Set(inserted.map((r) => r.day))].sort()
const codes = [...new Set(inserted.map((r) => r.code))].sort()
const zones = [...new Set(inserted.map((r) => (r.data as { time: { zone: string } }).time.zone))]
const supersedes = (day: string, code: string) =>
  (inserted.find((r) => r.day === day && r.code === code)?.data as
    { provenance: { supersedes?: string[] } } | undefined)?.provenance.supersedes

check('the request succeeds', res.status === 200, JSON.stringify(body))
check('every entry is written', inserted.length === observations.length, `${inserted.length} of ${observations.length}`)
check('every day survives', days.length === 8, days.join(' '))
check("today's point measurements survive", ['RESPIRATION_RATE', 'RESTING_HEART_RATE', 'STRESS', 'VO2_MAX'].every((c) => codes.includes(c)), codes.join(' '))
check('the device sentinel is resolved', zones.length === 1 && zones[0] === PROFILE_ZONE, zones.join(' '))
check('prior GARMIN rows are superseded', JSON.stringify(supersedes('2026-09-14', 'TOTAL_ENERGY')) === '["prior-a"]', String(body.superseded))
check('a MANUAL row is left alone', supersedes('2026-09-20', 'STEPS') === undefined)

await stub.shutdown()
console.log(failed === 0 ? '\nbacklog sync: all checks passed' : `\nbacklog sync: ${failed} failed`)
Deno.exit(failed === 0 ? 0 : 1)
