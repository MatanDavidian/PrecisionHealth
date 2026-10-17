import { PRODUCT_NAME } from '@/brand'

/**
 * The name, with the app icon's orange dot as the dot of its i.
 *
 * The owner's choice for now (2026-10-17, docs/PHASE-1-FINISH.md, P3): the
 * icon stays the plain dot, and the name carries the same dot, so the two read
 * as one brand. A distinctive mark — the Dial — is to come before the public
 * launch.
 *
 * Drawn as V + dotless ı + a positioned dot + metry. Fraunces has the dotless
 * i in its Latin set, so the letters stay one face. Pinned LTR: a Latin name
 * in a Hebrew page must not have its dot mirrored. Screen readers get the
 * name, not the pieces.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  if (!PRODUCT_NAME.startsWith('Vi')) return <span className={className}>{PRODUCT_NAME}</span>
  return (
    <span className={`font-display ${className}`} role="img" aria-label={PRODUCT_NAME} dir="ltr">
      <span aria-hidden="true">
        {PRODUCT_NAME[0]}
        <span className="relative inline-block">
          ı
          <span className="absolute left-[calc(50%+0.045em)] top-[0.2em] size-[0.17em] -translate-x-1/2 rounded-full bg-accent" />
        </span>
        {PRODUCT_NAME.slice(2)}
      </span>
    </span>
  )
}
