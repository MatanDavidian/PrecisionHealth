/**
 * The Supabase client.
 *
 * Configured from the environment so the same build can point at a personal
 * project, a staging one, or none at all. Both values are public by design:
 * the publishable key grants only what Row-Level Security allows, which is why
 * the policies in `supabase/migrations/0002` are the actual security boundary
 * (D16).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined

/** False when no project is configured — the app then stays local-only. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let client: SupabaseClient | undefined
let loading: Promise<SupabaseClient> | undefined

/**
 * Loaded on demand.
 *
 * supabase-js is ~220 kB, and a signed-out visit never needs a byte of it —
 * nor does a build with no project configured. Importing it dynamically keeps
 * it out of the initial bundle, which matters most on the phone this app is
 * designed around.
 */
export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) {
    return Promise.reject(
      new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'),
    )
  }
  if (client) return Promise.resolve(client)
  loading ??= import('@supabase/supabase-js').then(({ createClient }) => {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The sign-in link comes back with the session in the URL fragment.
        detectSessionInUrl: true,
      },
    })
    return client
  })
  return loading
}

/** Tests supply their own client, already signed in as a throwaway user. */
export function setSupabaseClient(override: SupabaseClient | undefined): void {
  client = override
  loading = override ? Promise.resolve(override) : undefined
}
