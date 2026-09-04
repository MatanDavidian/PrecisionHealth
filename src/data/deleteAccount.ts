/**
 * Deleting an account, from the client's side.
 *
 * S5.4. The destructive part is not here and could not be: removing an auth
 * user needs the service role, which must never reach a browser bundle (D16).
 * This asks the endpoint that owns auth, and then makes sure the app stops
 * behaving as though the account still exists.
 *
 * The confirmation word is sent rather than merely checked on screen. The
 * server checks it too — a confirmation enforced only by the UI is one that any
 * stray request skips — and sending it keeps the two halves saying the same
 * thing rather than the client asserting "the user meant it".
 */
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'
import { signOut } from './session'

/** What the person has to type. Must match the edge function's own constant. */
export const DELETE_CONFIRMATION = 'DELETE'

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Maps the endpoint's answers to something a person can act on.
 *
 * `leftover` is the interesting one: the account IS gone, but rows survived a
 * cascade that should have taken them. Reporting that as a plain failure would
 * be wrong — it would invite someone to try again on an account that no longer
 * exists — so it is named for what it is.
 */
const explain = (status: number, body: { error?: string; leftover?: string[] }): string => {
  if (body?.leftover?.length) {
    return `Your account was deleted, but some records did not go with it: ${body.leftover.join('; ')}. Please get in touch — do not try again.`
  }
  if (status === 401) return 'You are not signed in, so there is no account to delete.'
  if (body?.error === 'not_confirmed') return 'The confirmation did not match.'
  return 'The account could not be deleted. Nothing has been changed.'
}

export async function deleteAccount(confirmation: string): Promise<DeleteResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'This build has no account to delete.' }
  }

  const client = await getSupabaseClient()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, reason: 'You are not signed in, so there is no account to delete.' }

  let response: Response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirm: confirmation }),
    })
  } catch {
    return { ok: false, reason: 'Could not reach the server. Nothing has been deleted.' }
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    leftover?: string[]
  }
  if (!response.ok) return { ok: false, reason: explain(response.status, body) }

  /*
    Sign out afterwards, and do not let a failure here stop the report.

    The account is already gone; the local session is a stale token that cannot
    do anything. Refusing to say "deleted" because the sign-out call failed
    would tell the person the opposite of what happened.
  */
  await signOut().catch(() => {})
  return { ok: true }
}
