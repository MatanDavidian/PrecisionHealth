import { Link, useLocation } from 'react-router-dom'
import { DOCUMENTS, isDraft, type PolicyId } from '@/policy/documents'
import { PRODUCT_NAME } from '@/brand'
import { Card } from '../components/Card'
import { useT } from '../i18n'

/** Which document each path shows. Also what `ConsentGate` reads to stand aside. */
export const POLICY_AT: Record<string, PolicyId | undefined> = {
  '/privacy': 'PRIVACY',
  '/terms': 'TERMS',
}

/**
 * The privacy policy and the terms, on a page.
 *
 * Reachable without an account and without signing in, because someone
 * deciding whether to hand over their health data has to be able to read what
 * happens to it FIRST. A policy behind a login is not a disclosure.
 *
 * Rendered from `src/policy/documents.ts`, so the words on this page and the
 * words fingerprinted into the consent record cannot drift apart.
 */
export function Policy() {
  const t = useT()
  // From the path rather than a param: `/privacy` and `/terms` are the URLs a
  // policy has to have — the ones people paste into a Store listing.
  const { pathname } = useLocation()
  const document = DOCUMENTS[POLICY_AT[pathname] as PolicyId]

  if (!document) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-ink-muted">{t('policy.notFound')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="pb-6">
        <h1 className="font-display text-4xl">{document.title}</h1>
        <p className="pt-1 text-sm text-ink-muted">
          {t('policy.version', { name: PRODUCT_NAME, version: document.version })}
        </p>
      </header>

      {/*
        Said on the page, not only in a code comment.

        While any fact in here is still a placeholder, anyone reading it is
        reading a draft — and a privacy policy that looks finished when it is
        not is the one way this page could do real harm.
      */}
      {isDraft(document) && (
        <div className="mb-6 rounded-card border border-accent bg-accent-soft/40 p-4">
          <p className="text-sm font-medium">{t('policy.draftTitle')}</p>
          <p className="pt-1 text-xs leading-relaxed">{t('policy.draftBody')}</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {document.sections.map((section) => (
          <Card key={section.heading} label={section.heading}>
            {section.body?.map((paragraph) => (
              <p key={paragraph} className="pb-2 text-sm leading-relaxed last:pb-0">
                {paragraph}
              </p>
            ))}
            {section.bullets && (
              <ul className="list-disc space-y-1.5 ps-5 pt-1 text-sm leading-relaxed">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <p className="px-1 pt-5 text-xs text-ink-muted">
        <Link className="underline" to={document.id === 'PRIVACY' ? '/terms' : '/privacy'}>
          {document.id === 'PRIVACY' ? t('policy.readTerms') : t('policy.readPrivacy')}
        </Link>
      </p>
    </div>
  )
}
