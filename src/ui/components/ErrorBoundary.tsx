import { Component, type ReactNode } from 'react'
import { reportError } from '@/data/errorReporting'
import { useT } from '../i18n'

/**
 * A screen that throws while rendering shows this instead of a blank page,
 * and the error is reported. Everything is already saved as it is written, so
 * reloading loses nothing — the fallback says so, because "something broke"
 * on a health log reads as "my data is gone" unless told otherwise.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    reportError('render', error)
  }

  render() {
    return this.state.failed ? <Fallback /> : this.props.children
  }
}

function Fallback() {
  const t = useT()
  return (
    <div className="mx-auto max-w-md p-8" role="alert">
      <h1 className="font-display text-2xl">{t('app.brokeTitle')}</h1>
      <p className="pt-2 text-sm text-ink-muted">{t('app.brokeBody')}</p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="mt-4 rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
      >
        {t('app.reload')}
      </button>
    </div>
  )
}
