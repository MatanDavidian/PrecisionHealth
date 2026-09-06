/**
 * Credentials for devices that cannot sign in.
 *
 * S4.1. A watch has no browser and no way to finish a sign-in on a 46mm
 * screen, so it holds a bearer token instead. Until now that token was minted
 * by a Node script and pasted into the Supabase console by hand, which works
 * for exactly one person — the owner — and is the reason the Garmin app cannot
 * be published.
 *
 * Reads and revocation go straight to the table under RLS. Only MINTING needs
 * the edge function, because only minting needs the service role: the insert
 * privilege is withheld from `authenticated` on purpose (migration 0008), so
 * that the sole place a plaintext token exists on a server is one response
 * body.
 */
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'
import type { UserId } from '@/domain'

export interface DeviceToken {
  id: string
  label: string
  createdAt: string
  revokedAt?: string
  /** Absent until the device has actually synced once. */
  lastUsedAt?: string
}

/** A freshly minted token. The `token` field is never obtainable again. */
export interface MintedToken extends DeviceToken {
  token: string
}

export type MintResult =
  | { ok: true; minted: MintedToken }
  | { ok: false; reason: string }

/**
 * The tokens on this account.
 *
 * The hash is not merely omitted here — the `select` grant excludes that
 * column, so the database would refuse it. This function could not leak it by
 * mistake.
 */
export async function listDeviceTokens(userId: UserId): Promise<DeviceToken[] | undefined> {
  if (!isSupabaseConfigured) return undefined
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('device_tokens')
    .select('id, label, created_at, revoked_at, last_used_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  // Unknown, not empty: the migration may not be applied, and telling someone
  // they have no devices when we simply could not look is a different claim.
  if (error || !data) return undefined
  return data.map((row) => ({
    id: row.id as string,
    label: row.label as string,
    createdAt: row.created_at as string,
    revokedAt: (row.revoked_at as string | null) ?? undefined,
    lastUsedAt: (row.last_used_at as string | null) ?? undefined,
  }))
}

export async function mintDeviceToken(label: string): Promise<MintResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'This build has no account to add a device to.' }

  const client = await getSupabaseClient()
  const { data } = await client.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) return { ok: false, reason: 'Sign in first — a device belongs to an account.' }

  let response: Response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/issue-device-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ label }),
    })
  } catch {
    return { ok: false, reason: 'Could not reach the server. Nothing was created.' }
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    max?: number
    token?: string
    id?: string
    label?: string
    createdAt?: string
  }

  if (!response.ok || !body.token) {
    if (body.error === 'too_many_tokens') {
      return {
        ok: false,
        reason: `That is ${body.max ?? 8} devices already. Revoke one you no longer use first.`,
      }
    }
    if (body.error === 'label_required') return { ok: false, reason: 'Give the device a name first.' }
    return { ok: false, reason: 'The device could not be added. Nothing was created.' }
  }

  return {
    ok: true,
    minted: {
      token: body.token,
      id: body.id!,
      label: body.label!,
      createdAt: body.createdAt!,
    },
  }
}

/**
 * Withdraws a token.
 *
 * An update rather than a delete, and the row stays. A revoked token's past
 * writes remain attributable, which is the point of an audit trail — deleting
 * the row would orphan every observation it ever made.
 */
export async function revokeDeviceToken(id: string): Promise<void> {
  const client = await getSupabaseClient()
  const { error } = await client
    .from('device_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
