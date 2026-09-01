#!/usr/bin/env node
/**
 * Mint a bearer token for a device that cannot sign in.
 *
 *   node scripts/mint-device-token.mjs "Matan's FR265" <your-user-uuid>
 *
 * Prints two things: the token, which goes on the watch and is never stored
 * anywhere else, and the SQL that records only its hash.
 *
 * Deliberately a script rather than a screen. Minting needs the service role,
 * and a UI for it would mean either shipping that key or building an endpoint
 * to protect it — a lot of surface for something that happens once per watch.
 * When there is a second user, this becomes the pairing-code flow instead.
 */
import { randomBytes, createHash } from 'node:crypto'

const [, , label = 'A watch', userId] = process.argv

if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
  console.error('Usage: node scripts/mint-device-token.mjs "<label>" <user-uuid>')
  console.error('\nYour user id is in Supabase → Authentication → Users.')
  process.exit(1)
}

// 256 bits. Long enough that the hash needs no salt or slow KDF: there is no
// dictionary to run against a value with this much entropy.
const token = randomBytes(32).toString('hex')
const hash = createHash('sha256').update(token).digest('hex')

console.log(`
  TOKEN  (put this on the watch, then forget it — it is not recoverable)

    ${token}

  SQL    (run in Supabase → SQL Editor; only the hash is stored)

    insert into public.device_tokens (user_id, token_hash, label)
    values ('${userId}', '${hash}', ${JSON.stringify(label).replace(/"/g, "'")});

  To revoke it later:

    update public.device_tokens set revoked_at = now()
    where label = ${JSON.stringify(label).replace(/"/g, "'")};
`)
