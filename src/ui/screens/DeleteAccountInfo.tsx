import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { useT } from '../i18n'

/**
 * How to delete an account — a public page, at /delete-account.
 *
 * Google Play requires a page reachable outside the app where people can ask
 * for their account to be deleted, and anyone who has lost access to their
 * email cannot use the in-app button. So it is here, readable signed out, and
 * the consent gate stands aside for it as it does for the policies.
 */
export function DeleteAccountInfo() {
  const t = useT()
  return (
    <div className="mx-auto max-w-2xl">
      <header className="pb-6">
        <h1 className="font-display text-4xl">{t('deleteInfo.title')}</h1>
        <p className="pt-1 text-sm text-ink-muted">{t('deleteInfo.subtitle')}</p>
      </header>
      <div className="flex flex-col gap-4">
        <Card label={t('deleteInfo.inAppLabel')}>
          <p className="text-sm leading-relaxed">{t('deleteInfo.inApp')}</p>
          <p className="pt-2 text-sm leading-relaxed">{t('deleteInfo.what')}</p>
          <Link
            to="/settings?tab=account"
            className="mt-4 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
          >
            {t('deleteInfo.go')}
          </Link>
        </Card>
        <Card label={t('deleteInfo.subscriptionLabel')}>
          <p className="text-sm leading-relaxed">{t('deleteInfo.subscription')}</p>
        </Card>
        <Card label={t('deleteInfo.cannotSignInLabel')}>
          <p className="text-sm leading-relaxed">
            {t('deleteInfo.cannotSignIn')}{' '}
            <a className="underline" href="mailto:support@vimetry.app">
              support@vimetry.app
            </a>
            .
          </p>
        </Card>
        <Card label={t('deleteInfo.localLabel')}>
          <p className="text-sm leading-relaxed">{t('deleteInfo.local')}</p>
        </Card>
      </div>
      <p className="px-1 pt-5 text-xs text-ink-muted">
        <Link to="/privacy" className="underline">
          {t('deleteInfo.privacy')}
        </Link>
      </p>
    </div>
  )
}
