import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

export function Placeholder({ title, phase }: { title: StringKey; phase: StringKey }) {
  const t = useT()
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-4xl">{t(title)}</h1>
      <p className="pt-2 text-sm text-ink-muted">{t('app.notBuilt', { phase: t(phase) })}</p>
    </div>
  )
}
