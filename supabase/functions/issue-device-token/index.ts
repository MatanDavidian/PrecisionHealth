/**
 * Mints a bearer token for a device that cannot sign in.
 *
 * S4.1, replacing `scripts/mint-device-token.mjs`. That script's own comment
 * said what it was waiting for: "when there is a second user, this becomes the
 * pairing-code flow instead." A credential that exists only because its owner
 * can run Node and paste SQL into the Supabase console is a credential exactly
 * one person can have.
 *
 * This is the only place the plaintext ever exists on a server, and it exists
 * for the duration of one response. `device_tokens` stores a sha256, and the
 * insert privilege is deliberately not granted to `authenticated` (migration
 * 0008), so minting has to happen behind the service role — which is the whole
 * reason this is a function rather than a client-side insert.
 *
 * The id it mints for comes from the verified JWT and is never read from the
 * body. There is no shape of request that mints a token for somebody else.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/**
 * How many live tokens one account may hold.
 *
 * Not a security boundary — the caller is already authenticated, and each
 * token only ever writes to their own data. It is a bound on an endpoint that
 * writes a row per call, and a hint that something is wrong: nobody has eight
 * watches, so an account with eight live tokens has lost track of them, which
 * is itself worth stopping.
 */
const MAX_ACTIVE_TOKENS = 8

/** Long enough that a label is recognisable; short enough not to be a payload. */
const MAX_LABEL_CHARS = 60

/** Control characters, which belong in no label a person meant to type. */
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'not_signed_in' }, 401)

  let body: { label?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  /*
    Control characters are stripped rather than rejected.

    The label is written by a person naming their own watch and is read back
    into a list. A stray newline pasted from somewhere should not become an
    error they have to understand; it should just not be in the label.
  */
  const label = String(body?.label ?? '')
    .replace(CONTROL_CHARS, ' ')
    .trim()
    .slice(0, MAX_LABEL_CHARS)
  if (!label) return json({ error: 'label_required' }, 400)

  const admin = createClient(supabaseUrl, serviceRole)

  const { count, error: countError } = await admin
    .from('device_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('revoked_at', null)
  if (countError) return json({ error: 'server_error' }, 500)
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) {
    return json({ error: 'too_many_tokens', max: MAX_ACTIVE_TOKENS }, 409)
  }

  /*
    256 bits from the platform CSPRNG, hashed with a plain sha256.

    Not bcrypt or argon2, deliberately: those defend a human-chosen secret
    against a dictionary. There is no dictionary for a 256-bit random value,
    no reuse across sites, and no guessable structure — so a slow hash buys
    nothing and costs latency on every device sync.
  */
  const raw = new Uint8Array(32)
  crypto.getRandomValues(raw)
  const hex = (bytes: Uint8Array) =>
    [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  const token = hex(raw)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const tokenHash = hex(new Uint8Array(digest))

  const { data: inserted, error: insertError } = await admin
    .from('device_tokens')
    .insert({ user_id: user.id, token_hash: tokenHash, label })
    .select('id, label, created_at')
    .single()

  if (insertError || !inserted) return json({ error: 'server_error' }, 500)

  /*
    The only time this value is ever returned.

    Nothing stores it, nothing logs it, and no endpoint reads it back — the
    table holds a hash, and the select grant excludes even that. If the person
    closes the page without copying it, the token is gone and minting another
    is the only remedy. The screen has to say so BEFORE showing it.
  */
  return json({ token, id: inserted.id, label: inserted.label, createdAt: inserted.created_at })
})
