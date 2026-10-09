/**
 * Where the app reports what broke in someone's browser.
 *
 * Deployed with `--no-verify-jwt`: signed-out visitors hit errors too, and
 * the app's publishable key is not a JWT. What keeps it from being a free
 * database is the shape of what it stores — one counted row per distinct
 * error per day, at most 500 a day (migration 0015) — and the size of what it
 * reads. Everything is scrubbed again here (`_shared/errorReport.ts`): no
 * user id, no health data, nothing that looks like a key, address or photo.
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cleanReport, fingerprintSource } from '../_shared/errorReport.ts'

const CORS = {
  'x-vimetry-version': VERSION,
  'Access-Control-Expose-Headers': 'x-vimetry-version',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const respond = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  })

/** A report is a message and a stack. Anything bigger is not one. */
const MAX_BODY_BYTES = 16_000

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' })

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return respond(413, { error: 'too_large' })
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return respond(400, { error: 'bad_request' })
  }
  const report = cleanReport(parsed)
  if (!report) return respond(400, { error: 'bad_request' })

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprintSource(report)))
  const fingerprint = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { error } = await admin.rpc('record_client_error', {
    p_fingerprint: fingerprint,
    p_kind: report.kind,
    p_message: report.message,
    p_stack: report.stack ?? null,
    p_route: report.route ?? null,
    p_version: report.version ?? null,
    p_browser: report.browser ?? null,
  })
  // The reporter never retries, and a failed report must not become a second error.
  return error ? respond(503, { error: 'unavailable' }) : respond(204)
})
