import { useRef, useState } from 'react'
import { convert, type MealSlot, type UsualMeal } from '@/domain'
import { useT } from '../../i18n'

/**
 * The camera, and the one sentence a camera cannot capture.
 *
 * The note is the cheapest accuracy in the app. A photo cannot show that the
 * pan had no oil, or that half of it went back in the fridge; the person
 * holding the phone knows both, and one line from them beats a bigger model.
 * It is optional and collapsed, because most meals need nothing said about
 * them and a form in front of the shutter is a reason not to log at all.
 */
export function PhotoPanel({
  note,
  onNoteChange,
  onPhoto,
  usualNow,
  onLogUsual,
  onSeeAll,
  busy,
}: {
  note: string
  onNoteChange: (next: string) => void
  onPhoto: (file: File) => void
  /** The single thing eaten most often at this hour, if there is one. */
  usualNow?: UsualMeal
  onLogUsual: (usual: UsualMeal) => void
  onSeeAll: () => void
  slot: MealSlot
  busy: boolean
}) {
  const t = useT()
  const fileInput = useRef<HTMLInputElement>(null)
  const [noteOpen, setNoteOpen] = useState(note.trim().length > 0)

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPhoto(file)
          e.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-hairline bg-card text-ink-muted transition-colors hover:bg-card-soft"
      >
        <CameraIcon />
        <span className="text-sm font-medium text-ink">{t('log.photo.take')}</span>
        <span className="text-xs">{t('log.photo.orLibrary')}</span>
      </button>

      <div className="flex flex-wrap items-center gap-3 pt-3">
        {noteOpen ? null : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            <PlusIcon />
            {t('log.photo.addNote')}
          </button>
        )}
        <span className="text-xs text-ink-muted">{t('log.photo.noteHint')}</span>
      </div>

      {noteOpen && (
        <div className="pt-3">
          <label className="sr-only" htmlFor="photo-note">
            {t('log.photo.noteLabel')}
          </label>
          <textarea
            id="photo-note"
            rows={2}
            autoFocus
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t('log.photo.notePlaceholder')}
            className="w-full rounded-card border border-hairline bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          />
          {note.trim().length > 0 && (
            <p className="pt-1 text-xs text-ink-muted">{t('log.photo.noteSent')}</p>
          )}
        </div>
      )}

      {usualNow && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onLogUsual(usualNow)}
            className="mt-5 flex w-full items-center gap-3 rounded-card border border-hairline bg-surface p-3 text-start transition-colors hover:bg-card-soft disabled:opacity-40"
          >
            <span className="whitespace-nowrap text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {t('log.photo.usualNow')}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {usualNow.template.items.map((item) => item.name).join(', ')}
              <span className="text-ink-muted"> · {kcal(usualNow)} kcal</span>
            </span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-surface">
              <PlusIcon />
            </span>
          </button>
          <p className="pt-2 text-xs text-ink-muted">
            {t('log.photo.usualHint')} {t('log.photo.usualHintLink')}{' '}
            <button type="button" onClick={onSeeAll} className="underline">
              {t('log.mode.again')}
            </button>
            .
          </p>
        </>
      )}
    </div>
  )
}

const kcal = (usual: UsualMeal): number =>
  Math.round(
    usual.template.items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0),
  )

function CameraIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8a1 1 0 0 0 .8-.4l1-1.3a1 1 0 0 1 .8-.4h4.2a1 1 0 0 1 .8.4l1 1.3a1 1 0 0 0 .8.4h1.8A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
