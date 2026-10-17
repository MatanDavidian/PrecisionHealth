/**
 * Someone reports an AI answer — from inside the app, without leaving it
 * (Google Play's AI-generated content policy).
 *
 * Deployed with `--no-verify-jwt`: signed-out people analyse on their own
 * key and can report too, and the app's publishable key is not a JWT. What
 * keeps it from being a free database is migration 0017: a fixed shape, at
 * most 500 a day, a year's retention. The note is scrubbed like an error
 * report (`_shared/errorReport.ts`): no emails, keys, tokens or photos.
 *
 * The owner reads reports in the `ai_reports` table; the daily check emails
 * when any were marked offensive or harmful.
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { scrub } from '../_shared/errorReport.ts'

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

const KINDS = new Set(['estimate', 'insight'])
const REASONS = new Set(['offensive', 'harmful', 'wrong', 'other'])
const short = (value: unknown, limit: number) =>
  typeof value === 'string' && value.trim() ? scrub(value.trim()).slice(0, limit) : null

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' })

  const raw = await request.text()
  if (raw.length > 4_000) return respond(413, { error: 'too_large' })
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return respond(400, { error: 'bad_request' })
  }
  if (!KINDS.has(body?.kind as string) || !REASONS.has(body?.reason as string)) {
    return respond(400, { error: 'bad_request' })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { error } = await admin.rpc('record_ai_report', {
    p_kind: body.kind,
    p_reason: body.reason,
    p_note: short(body.note, 500),
    p_model: short(body.model, 64),
    p_version: short(body.version, 64),
  })
  return error ? respond(503, { error: 'unavailable' }) : respond(204)
})
