/**
 * Deleting an account, for real.
 *
 * S5.4. This does exactly one privileged thing, and checks two facts first:
 * that the caller is signed in, and that they typed the confirmation. It
 * cannot be aimed at anyone else — the id it deletes comes from the verified
 * JWT and is never read from the request body.
 *
 * The rows are not deleted one table at a time. Every table that references a
 * person declares `on delete cascade` on `auth.users` (migrations 0001, 0003,
 * 0007, 0008), so removing the auth user erases all of them inside a single
 * Postgres transaction — all or nothing, with no window in which an account is
 * half gone. A hand-rolled sweep would be weaker than that, not stronger: it
 * can fail between two tables, and each failure is one more way for a person's
 * data to survive their decision to delete it.
 *
 * What it does do afterwards is look. "We deleted it" is a claim, and the
 * schema is the kind of thing that changes — a table added later without the
 * cascade would strand data silently. The check is cheap and it means the
 * answer is observed rather than assumed.
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
 * What the person has to type. Checked here as well as on screen, because a
 * confirmation enforced only by the UI is one that any stray request skips.
 */
const CONFIRMATION = 'DELETE'

/** Tables that must hold nothing for this user once the cascade has run. */
const TABLES = [
  'meals',
  'workouts',
  'sleep',
  'observations',
  'goals',
  'inferences',
  'usage',
  'device_tokens',
  'user_preferences',
  'profiles',
] as const

/** Postgres: relation does not exist. Tables still to come are not leftovers. */
const UNDEFINED_TABLE = '42P01'

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

  let body: { confirm?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (body?.confirm !== CONFIRMATION) return json({ error: 'not_confirmed' }, 400)

  const admin = createClient(supabaseUrl, serviceRole)

  const { error: authError } = await admin.auth.admin.deleteUser(user.id)
  if (authError) return json({ error: 'delete_failed', detail: [authError.message] }, 500)

  // Look, rather than assume. Anything still here is a table that has lost its
  // cascade, and the person is told instead of being reassured.
  const leftover: string[] = []
  for (const table of TABLES) {
    const { count, error } = await admin
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (error) {
      if (error.code !== UNDEFINED_TABLE) leftover.push(`${table}: ${error.message}`)
      continue
    }
    if (count) leftover.push(`${table}: ${count} rows remain`)
  }

  if (leftover.length) return json({ deleted: true, leftover }, 500)
  return json({ deleted: true })
})
