/**
 * A stand-in database and push service for the reminder functions.
 *
 * Just enough PostgREST for what `reminders` and `send-reminders` ask:
 * filters (eq, neq, is.null), upserts on a conflict column, updates,
 * deletes, a head count, and the five RPCs migration 0018 adds. And a push
 * service that records what would have reached each phone.
 */
export type Row = Record<string, unknown>

export const state = {
  tables: {} as Record<string, Row[]>,
  tokens: new Map<string, string>(),
  vapid: undefined as unknown,
  remindersToken: 'r'.repeat(64),
  /** Days already claimed, `${user}|${kind}|${day}`. */
  claimed: new Set<string>(),
  /** What the push service received. */
  pushes: [] as { endpoint: string; headers: Headers; body: Uint8Array }[],
  /** Status the push service answers with, by endpoint; 201 otherwise. */
  pushStatus: new Map<string, number>(),
}

export function reset() {
  state.tables = {}
  state.tokens = new Map()
  state.vapid = undefined
  state.claimed = new Set()
  state.pushes = []
  state.pushStatus = new Map()
}

export const rows = (name: string) => (state.tables[name] ??= [])

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [column, filter] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(column)) continue
    const value = row[column] === null || row[column] === undefined ? '' : String(row[column])
    if (filter.startsWith('eq.') && value !== filter.slice(3)) return false
    if (filter.startsWith('neq.') && value === filter.slice(4)) return false
    if (filter === 'is.null' && value !== '') return false
  }
  return true
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

export function startDb(port: number) {
  return Deno.serve({ port, onListen: () => {} }, async (req) => {
    const url = new URL(req.url)
    const path = url.pathname

    if (path === '/auth/v1/user') {
      const user = state.tokens.get((req.headers.get('authorization') ?? '').replace('Bearer ', ''))
      return user ? json({ id: user, aud: 'authenticated', role: 'authenticated' }) : json({ msg: 'invalid JWT' }, 401)
    }

    const rpc = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)
    if (rpc) {
      const args = (await req.json().catch(() => ({}))) as Record<string, unknown>
      switch (rpc[1]) {
        case 'reminders_token_ok':
          return json(args.p_token === state.remindersToken)
        case 'push_keys':
          return json(state.vapid ?? null)
        case 'push_keys_init':
          state.vapid ??= args.p_keys
          return json(state.vapid)
        case 'claim_reminder': {
          const key = `${args.p_user}|${args.p_kind}|${args.p_day}`
          if (state.claimed.has(key)) return json(false)
          state.claimed.add(key)
          return json(true)
        }
      }
      return json({ message: `rpc not stubbed: ${rpc[1]}` }, 404)
    }

    const rest = path.match(/^\/rest\/v1\/([a-z_]+)$/)
    if (!rest) return json({ message: `not stubbed: ${req.method} ${path}` }, 404)
    const name = rest[1]
    const table = rows(name)

    if (req.method === 'GET' || req.method === 'HEAD') {
      const found = table.filter((r) => matches(r, url.searchParams))
      if (req.method === 'HEAD') return json(undefined, 200, { 'content-range': `*/${found.length}` })
      return json(found)
    }
    if (req.method === 'POST') {
      const body = await req.json()
      const conflict = url.searchParams.get('on_conflict')
      for (const given of (Array.isArray(body) ? body : [body]) as Row[]) {
        const existing = conflict ? table.find((r) => r[conflict] === given[conflict]) : undefined
        if (existing) Object.assign(existing, given)
        else table.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...given })
      }
      return json(undefined, 201)
    }
    if (req.method === 'PATCH') {
      const fields = await req.json()
      for (const r of table.filter((r) => matches(r, url.searchParams))) Object.assign(r, fields)
      return json(undefined, 204)
    }
    if (req.method === 'DELETE') {
      state.tables[name] = table.filter((r) => !matches(r, url.searchParams))
      return json(undefined, 204)
    }
    return json({ message: `not stubbed: ${req.method} ${path}` }, 404)
  })
}

/** The push services: anything to their addresses is recorded instead of sent. */
const before = globalThis.fetch
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const host = new URL(href).hostname
  if (host === 'fcm.googleapis.com' || host.endsWith('push.services.mozilla.com')) {
    state.pushes.push({
      endpoint: href,
      headers: new Headers(init?.headers),
      body: new Uint8Array(init?.body as ArrayBuffer),
    })
    return new Response(null, { status: state.pushStatus.get(href) ?? 201 })
  }
  return before(input, init)
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A real browser's keys, the shape a subscription carries. */
export async function browserKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) }
}
