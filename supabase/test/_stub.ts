/**
 * A stand-in Supabase and a fake Lemon Squeezy, for the billing handlers.
 *
 * Just enough PostgREST for supabase-js: select with eq / in / gte / is.null,
 * HEAD counts, insert (returning the row when asked), upsert, update; plus auth's "who is this token" and admin
 * user deletion, which cascades the way the migrations declare. A row whose
 * user does not exist is refused with Postgres's foreign-key error — the case
 * a deleted account produces.
 *
 * Lemon Squeezy is faked at `fetch`: every call is recorded, and `lemon.mode`
 * makes it fail the ways the real one can.
 *
 * Each test file imports one function, which serves on :8000, and runs as its
 * own process — so the stub's port can be the same in all of them.
 */

export type Row = Record<string, unknown>

export const db = {
  tables: {} as Record<string, Row[]>,
  /** token → the user it signs in as */
  tokens: new Map<string, { id: string; email?: string }>(),
  /** Users that exist; anything else trips the foreign key. */
  users: new Set<string>(),
  /** Tables the account deletion's cascade "forgets", to prove the leftover check. */
  noCascade: new Set<string>(),
  /** Tables whose reads fail, to prove failing closed. */
  failing: new Set<string>(),
  deletedUsers: [] as string[],
}

/** Tables with a `user_id` that references auth.users. */
const USER_TABLES = new Set(['subscriptions', 'usage', 'meals', 'observations', 'profiles', 'device_tokens'])

export function resetDb() {
  db.tables = {}
  db.tokens = new Map()
  db.users = new Set()
  db.noCascade = new Set()
  db.failing = new Set()
  db.deletedUsers = []
}

export const table = (name: string) => (db.tables[name] ??= [])

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [column, filter] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(column)) continue
    const value = row[column] === null || row[column] === undefined ? '' : String(row[column])
    if (filter.startsWith('eq.') && value !== filter.slice(3)) return false
    if (filter.startsWith('gte.') && value < filter.slice(4)) return false
    if (filter === 'is.null' && value !== '') return false
    if (filter.startsWith('in.(')) {
      const options = filter.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))
      if (!options.includes(value)) return false
    }
  }
  return true
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

const foreignKeyError = () =>
  json({ code: '23503', message: 'insert or update violates foreign key constraint' }, 409)

const PRIMARY_KEY: Record<string, string> = { subscriptions: 'id', billing_events: 'id', device_tokens: 'id' }

/** What the database fills in itself. */
const DEFAULTS: Record<string, () => Row> = {
  device_tokens: () => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), revoked_at: null }),
}

export function startDb(port = 8997) {
  return Deno.serve({ port, onListen: () => {} }, async (req) => {
    const url = new URL(req.url)
    const path = url.pathname

    if (path === '/auth/v1/user') {
      const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
      const user = db.tokens.get(token)
      if (!user || !db.users.has(user.id)) return json({ code: 401, msg: 'invalid JWT' }, 401)
      return json({ id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' })
    }

    const deleting = path.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/)
    if (deleting && req.method === 'DELETE') {
      const id = deleting[1]
      db.users.delete(id)
      db.deletedUsers.push(id)
      for (const [name, rows] of Object.entries(db.tables)) {
        if (db.noCascade.has(name)) continue
        db.tables[name] = rows.filter((r) => r.user_id !== id)
      }
      return json({})
    }

    const rest = path.match(/^\/rest\/v1\/([a-z_]+)$/)
    if (!rest) return json({ message: `not stubbed: ${req.method} ${path}` }, 404)
    const name = rest[1]
    if (db.failing.has(name)) return json({ message: `${name} is down` }, 500)
    const rows = table(name)

    if (req.method === 'GET' || req.method === 'HEAD') {
      const found = rows.filter((r) => matches(r, url.searchParams))
      if (req.method === 'HEAD') return json(undefined, 200, { 'content-range': `*/${found.length}` })
      return json(found)
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const incoming: Row[] = Array.isArray(body) ? body : [body]
      const upsert = (req.headers.get('prefer') ?? '').includes('merge-duplicates')
      const written: Row[] = []
      for (const given of incoming) {
        const fields = { ...DEFAULTS[name]?.(), ...given }
        if (USER_TABLES.has(name) && fields.user_id && !db.users.has(String(fields.user_id))) {
          return foreignKeyError()
        }
        const key = PRIMARY_KEY[name]
        const existing = key ? rows.find((r) => r[key] === fields[key]) : undefined
        if (existing && upsert) Object.assign(existing, fields)
        else if (existing) return json({ code: '23505', message: 'duplicate key' }, 409)
        else rows.push({ ...fields })
        written.push(existing ?? fields)
      }
      if (!(req.headers.get('prefer') ?? '').includes('return=representation')) return json(undefined, 201)
      const single = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object')
      return json(single ? written[0] : written, 201)
    }

    if (req.method === 'PATCH') {
      const fields = await req.json()
      for (const r of rows.filter((r) => matches(r, url.searchParams))) Object.assign(r, fields)
      return json(undefined, 204)
    }

    return json({ message: `not stubbed: ${req.method} ${path}` }, 404)
  })
}

// ------------------------------------------------------------ Lemon Squeezy --

export const lemon = {
  mode: 'ok' as 'ok' | 'error' | 'throw' | 'missing',
  calls: [] as { method: string; path: string; body: unknown; key: string }[],
  portal: 'https://vimetry.lemonsqueezy.com/billing?expires=1&signature=portal',
  checkout: 'https://vimetry.lemonsqueezy.com/checkout/custom/abc?expires=1&signature=checkout',
}

export function resetLemon() {
  lemon.mode = 'ok'
  lemon.calls = []
}

const realFetch = globalThis.fetch
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!href.startsWith('https://api.lemonsqueezy.com/')) return realFetch(input, init)

  const path = new URL(href).pathname
  const method = init?.method ?? 'GET'
  lemon.calls.push({
    method,
    path,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    key: new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '',
  })
  if (lemon.mode === 'throw') throw new TypeError('network down')
  if (lemon.mode === 'error') return new Response('{"errors":[{"detail":"server error"}]}', { status: 500 })
  if (lemon.mode === 'missing') return new Response('{"errors":[{"status":"404"}]}', { status: 404 })

  if (method === 'POST' && path === '/v1/checkouts') {
    return Response.json({ data: { type: 'checkouts', id: 'chk-1', attributes: { url: lemon.checkout } } })
  }
  const sub = path.match(/^\/v1\/subscriptions\/([^/]+)$/)
  if (sub && method === 'DELETE') {
    return Response.json({ data: { type: 'subscriptions', id: sub[1], attributes: { status: 'cancelled' } } })
  }
  if (sub && method === 'GET') {
    return Response.json({ data: { type: 'subscriptions', id: sub[1], attributes: { urls: { customer_portal: lemon.portal } } } })
  }
  return new Response('{"errors":[{"detail":"not faked"}]}', { status: 404 })
}

// -------------------------------------------------------------- reporting --

let failed = 0
export const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failed++
}
export function finish(label: string): never {
  console.log(failed === 0 ? `\n${label}: all checks passed` : `\n${label}: ${failed} failed`)
  Deno.exit(failed === 0 ? 0 : 1)
}

export async function call(body: unknown, init: { token?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const response = await realFetch('http://localhost:8000/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: init.raw ?? JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(text)
  } catch { /* keep {} */ }
  return { status: response.status, body: parsed }
}
