/**
 * The same contract, against a real Supabase project.
 *
 * Skipped unless credentials are present, so the default `npm test` needs no
 * network and no account. Enable it by adding a dedicated test user to
 * `.env.local` (see supabase/README.md):
 *
 *   VITE_SUPABASE_URL=…
 *   VITE_SUPABASE_ANON_KEY=…
 *   SUPABASE_TEST_EMAIL=…
 *   SUPABASE_TEST_PASSWORD=…
 *
 * It signs in as that user, so every row it writes is subject to exactly the
 * same Row-Level Security a real signed-in user faces — which is the point.
 * Rows are prefixed per run and deleted... they cannot be: the schema is
 * append-only by design (D4). They are therefore written under a unique
 * prefix and simply left; a test account accumulating rows is the price of
 * proving that history cannot be rewritten.
 */
import { beforeAll, describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// Node 20 has no native WebSocket, and supabase-js builds a realtime client
// even when nothing subscribes. The browser uses its own.
import ws from 'ws'
import { createSupabaseRepositories } from '../supabase/supabaseRepositories'
import { runRepositoryContract, type ContractContext } from './contract'
import type { AppSettings, SettingsRepository } from '../repositories'
import { DEFAULT_SETTINGS } from '@/config'
import type { UserId } from '@/domain'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.SUPABASE_TEST_EMAIL
const password = process.env.SUPABASE_TEST_PASSWORD
const configured = Boolean(url && key && email && password)

/** Settings stay on the device, so the contract gets an in-memory stand-in. */
const memorySettings = (): SettingsRepository => {
  let current: AppSettings = { ...DEFAULT_SETTINGS }
  return {
    get: async () => current,
    save: async (patch) => {
      current = { ...current, ...patch }
    },
  }
}

if (!configured) {
  describe.skip('repository contract: Supabase (no credentials in .env.local)', () => {
    it('skipped', () => {})
  })
} else {
  let client: SupabaseClient
  let userId: UserId

  beforeAll(async () => {
    client = createClient(url!, key!, {
      auth: { persistSession: false },
      realtime: { transport: ws as unknown as never },
    })
    const { data, error } = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    })
    if (error) throw new Error(`Could not sign in the test user: ${error.message}`)
    userId = data.user!.id as UserId
  }, 30_000)

  runRepositoryContract('Supabase', async (): Promise<ContractContext> => ({
    repositories: createSupabaseRepositories(client, memorySettings()),
    userId,
    // Unique per run: the store is append-only, so runs must not collide.
    prefix: `sb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  }))
}
