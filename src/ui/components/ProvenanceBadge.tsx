import { needsConfirmation, type DataSource, type Provenance } from '@/domain'

const SOURCE_LABEL: Record<DataSource, string> = {
  USER: 'Manual',
  GARMIN: 'Garmin',
  APPLE_HEALTH: 'Apple Health',
  HEALTH_CONNECT: 'Health Connect',
  SMART_SCALE: 'Scale',
  AI_ESTIMATE: 'AI estimate',
  LAB_DOCUMENT: 'Lab report',
}

export const sourceLabel = (source: DataSource) => SOURCE_LABEL[source]

/**
 * An unconfirmed AI estimate must never look like a measured value. This is the
 * visual half of that rule; the model half is `needsConfirmation`.
 */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  if (!needsConfirmation(provenance)) return null
  const confidence =
    provenance.confidence != null ? ` ${Math.round(provenance.confidence * 100)}%` : ''
  return (
    <span className="ml-2 whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
      AI estimate{confidence}
    </span>
  )
}
