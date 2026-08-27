import { needsConfirmation, type DataSource, type Provenance } from '@/domain'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

/** Where a reading came from, as a dictionary key rather than a fixed word. */
export const sourceKey = (source: DataSource): StringKey =>
  `source.${source}` as StringKey

/**
 * An unconfirmed AI estimate must never look like a measured value. This is the
 * visual half of that rule; the model half is `needsConfirmation`.
 */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const t = useT()
  if (!needsConfirmation(provenance)) return null
  const confidence =
    provenance.confidence != null ? ` ${Math.round(provenance.confidence * 100)}%` : ''
  return (
    <span className="ms-2 whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
      {t('source.AI_ESTIMATE')}
      {confidence}
    </span>
  )
}
