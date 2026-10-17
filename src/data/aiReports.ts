/**
 * Reporting an AI answer from inside the app (Google Play's AI-generated
 * content policy).
 *
 * What is sent is deliberately small: which feature, why, an optional note,
 * the model and the build. Not the meal, not the photo, not the answer, not
 * the account — so a report carries no health data and identifies nobody.
 * The server scrubs the note again (`report-ai`).
 */
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'

export type AiReportKind = 'estimate' | 'insight'
export type AiReportReason = 'offensive' | 'harmful' | 'wrong' | 'other'
export const AI_REPORT_REASONS: AiReportReason[] = ['offensive', 'harmful', 'wrong', 'other']
export const AI_REPORT_NOTE_LIMIT = 500

export interface AiReport {
  kind: AiReportKind
  reason: AiReportReason
  note?: string
  model?: string
}

function buildVersion(): string | undefined {
  return document.querySelector<HTMLMetaElement>('meta[name="build-commit"]')?.content || undefined
}

/** True once the report is stored. */
export async function sendAiReport(report: AiReport): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/report-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY! },
      body: JSON.stringify({
        kind: report.kind,
        reason: report.reason,
        note: report.note?.trim().slice(0, AI_REPORT_NOTE_LIMIT) || undefined,
        model: report.model,
        version: buildVersion(),
      }),
    })
    return response.ok
  } catch {
    return false
  }
}
