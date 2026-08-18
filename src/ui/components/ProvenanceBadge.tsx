import type { Provenance } from '@/domain'

/**
 * Makes the roadmap's core distinction visible: an unconfirmed AI estimate must
 * never look like a measured value.
 */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  if (provenance.source !== 'AI_ESTIMATE') return null
  const confidence = provenance.confidence != null ? ` ${Math.round(provenance.confidence * 100)}%` : ''
  return (
    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
      AI estimate{confidence}
    </span>
  )
}
