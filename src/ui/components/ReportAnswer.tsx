import { useState } from 'react'
import {
  AI_REPORT_NOTE_LIMIT,
  AI_REPORT_REASONS,
  sendAiReport,
  type AiReportKind,
  type AiReportReason,
} from '@/data/aiReports'
import { useT } from '../i18n'

/**
 * "Report this answer", under anything the model wrote.
 *
 * Google Play asks that offensive AI output can be reported without leaving
 * the app. The form says what goes with the report — nothing of the meal or
 * the answer — because a person reporting a bad answer about their dinner
 * should not have to wonder whether the dinner is going too.
 */
export function ReportAnswer({ kind, model }: { kind: AiReportKind; model?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<AiReportReason | null>(null)
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  if (state === 'sent') {
    return (
      <p role="status" className="pt-3 text-xs text-ink-muted">
        {t('report.thanks')}
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pt-3 text-xs text-ink-muted underline"
      >
        {t('report.open')}
      </button>
    )
  }

  const send = async () => {
    if (!reason) return
    setState('sending')
    setState((await sendAiReport({ kind, reason, note, model })) ? 'sent' : 'failed')
  }

  return (
    <form
      aria-label={t('report.title')}
      className="mt-3 rounded-xl border border-hairline p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <p className="text-sm font-medium">{t('report.title')}</p>
      <fieldset className="space-y-1 pt-2">
        <legend className="sr-only">{t('report.why')}</legend>
        {AI_REPORT_REASONS.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              className="accent-accent"
              name={`report-reason-${kind}`}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {t(`report.reason.${value}`)}
          </label>
        ))}
      </fieldset>
      <label className="block pt-3 text-xs text-ink-muted">
        {t('report.noteLabel')}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={AI_REPORT_NOTE_LIMIT}
          rows={2}
          dir="auto"
          className="mt-1 block w-full rounded-lg border border-hairline bg-surface p-2 text-sm text-ink"
        />
      </label>
      <p className="pt-2 text-xs text-ink-muted">{t('report.whatIsSent')}</p>
      {state === 'failed' && <p className="pt-2 text-xs text-accent">{t('report.failed')}</p>}
      <div className="flex flex-wrap gap-3 pt-3">
        <button
          type="submit"
          disabled={!reason || state === 'sending'}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-surface disabled:opacity-40"
        >
          {state === 'sending' ? t('report.sending') : t('report.send')}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setState('idle')
          }}
          className="rounded-full border border-hairline px-4 py-1.5 text-sm"
        >
          {t('report.cancel')}
        </button>
      </div>
    </form>
  )
}
