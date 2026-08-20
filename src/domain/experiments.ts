/**
 * N-of-1 experiments — modelled now, built much later.
 *
 * This type exists at Phase 1 for one reason: it is the only feature that
 * imposes a requirement on everything else. An experiment compares a metric
 * across time windows, which means observations must be queryable by window,
 * must carry provenance (an AI-estimated protein intake cannot be evidence in
 * your own experiment), and must never be silently rewritten after the fact.
 * The model already satisfies all three. Discovering that requirement in phase
 * 14 instead would have meant a migration.
 *
 * DECISION: the evaluation is COMPUTED and stores its own statistics. A model
 * may describe the result in prose, but the numbers come from the rule engine
 * and carry the sample size, so "coffee ruins my sleep" can never be asserted
 * from four nights of data.
 */
import type { Id } from './ids'
import type { ObservationCode } from './observation'
import type { Provenance } from './provenance'
import type { CalendarDate } from './time'
import type { UserId } from './user'

export type ExperimentId = Id<'Experiment'>

export type PhaseKind = 'BASELINE' | 'INTERVENTION' | 'WASHOUT'

export interface ExperimentPhase {
  kind: PhaseKind
  startsOn: CalendarDate
  endsOn: CalendarDate
}

export type ExperimentStatus = 'DRAFT' | 'RUNNING' | 'COMPLETE' | 'ABANDONED'

export interface ExperimentEvaluation {
  /** Mean of the outcome metric per phase, canonical units. */
  baselineMean: number
  interventionMean: number
  /** Difference expressed in standard deviations. */
  effectSize: number
  /** Days of usable data — reported so a two-day "result" cannot masquerade as evidence. */
  sampleSize: number
  /** Set when sampleSize is too small or the data too noisy to conclude anything. */
  inconclusive: boolean
}

export interface Experiment {
  id: ExperimentId
  userId: UserId
  hypothesis: string
  intervention: string
  /** The single outcome metric, chosen before the experiment starts. */
  outcome: ObservationCode
  phases: ExperimentPhase[]
  status: ExperimentStatus
  evaluation?: ExperimentEvaluation
  provenance: Provenance
}
