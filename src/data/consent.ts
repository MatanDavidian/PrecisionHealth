/**
 * Recording what someone agreed to.
 *
 * S5.2. The requirement that shapes this is Art. 7(1) — "be able to
 * demonstrate that the data subject has consented" — which is an evidence
 * requirement, not a UI one. A flag saying `agreed = true` demonstrates
 * nothing: not to what, not in which words, not when.
 *
 * So consent is an event, appended, exactly like every other record here (D4).
 * A new policy version is a new grant and the old one stays readable, which is
 * the only way to answer "what had this person agreed to on the day we
 * processed that photograph?"
 *
 * Signed out there is nothing to record and nobody to record it for: the data
 * never leaves the browser, no third party sees it, and there is no controller
 * relationship to consent to. Consent begins at the account.
 */
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'
import { DOCUMENTS, documentText, type PolicyDocument, type PolicyId } from '@/policy/documents'
import type { UserId } from '@/domain'

export interface ConsentRecord {
  subject: PolicyId | 'AI_PROCESSING'
  version: string
  action: 'GRANTED' | 'WITHDRAWN'
  recordedAt: string
}

/** The documents a person must have agreed to before the app will carry on. */
export const REQUIRED: PolicyId[] = ['PRIVACY', 'TERMS']

/**
 * A fingerprint of the exact text shown.
 *
 * Versions are set by a human editing a file, and humans fix typos without
 * bumping a version. This is what makes the record evidential: it can say
 * WHICH words were on screen.
 *
 * `crypto.subtle` needs a secure context. Over plain http — a phone on a LAN
 * looking at a dev build — it is absent, and a missing fingerprint must not
 * stop someone consenting. The record is weaker; refusing to take it would be
 * worse.
 */
export async function fingerprint(text: string): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** What this person has already agreed to. Empty when there is no account. */
export async function readConsents(userId: UserId): Promise<ConsentRecord[] | undefined> {
  if (!isSupabaseConfigured) return undefined
  const client = await getSupabaseClient()
  const { data, error } = await client
    .from('consents')
    .select('subject, version, action, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: true })

  /*
    Unknown, not "none".
    
    A table that is not there yet — the migration unapplied — must not read as
    "this person has consented to nothing", because that would put a consent
    wall in front of an app that has no way to record the answer.
  */
  if (error || !data) return undefined
  return data.map((row) => ({
    subject: row.subject as ConsentRecord['subject'],
    version: row.version as string,
    action: row.action as ConsentRecord['action'],
    recordedAt: row.recorded_at as string,
  }))
}

/**
 * Whether a grant is currently in force for one document.
 *
 * The LAST row wins, because withdrawal is expressed by appending. Anything
 * else would let a withdrawal be undone by scrolling far enough back.
 */
export function isGranted(consents: ConsentRecord[], document: PolicyDocument): boolean {
  const forDocument = consents.filter(
    (record) => record.subject === document.id && record.version === document.version,
  )
  return forDocument.at(-1)?.action === 'GRANTED'
}

/** Which of the required documents still need agreeing to. */
export function outstanding(consents: ConsentRecord[]): PolicyDocument[] {
  return REQUIRED.map((id) => DOCUMENTS[id]).filter((doc) => !isGranted(consents, doc))
}

/**
 * Records agreement to every outstanding document, in one write.
 *
 * All of them together because they are agreed to together, on one screen, in
 * one act. Writing them one at a time would allow a half-consented account if
 * the second call failed — and the failure mode of a half-consented account is
 * that nobody can tell whether the person agreed.
 */
export async function grant(
  userId: UserId,
  documents: PolicyDocument[],
  locale: string,
  newId: () => string,
): Promise<void> {
  if (!isSupabaseConfigured || documents.length === 0) return
  const client = await getSupabaseClient()
  const rows = await Promise.all(
    documents.map(async (document) => ({
      id: newId(),
      user_id: userId,
      subject: document.id,
      version: document.version,
      action: 'GRANTED' as const,
      locale,
      document_sha: (await fingerprint(documentText(document))) ?? null,
    })),
  )
  const { error } = await client.from('consents').insert(rows)
  if (error) throw new Error(error.message)
}
