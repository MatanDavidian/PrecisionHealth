import { useEffect, useState } from 'react'
import { getRepositories, localRepositories } from '@/data'
import {
  adoptInto,
  findAdoptableRecords,
  hasAdopted,
  markAdopted,
  type AdoptableRecords,
  type AdoptionResult,
} from '@/data/adoption'
import { LOCAL_USER_ID } from '@/data/session'
import { useDataRevision } from '../DataProvider'
import { Card } from './Card'

type State =
  | { kind: 'checking' }
  | { kind: 'nothing' }
  | { kind: 'offer'; records: AdoptableRecords }
  | { kind: 'moving' }
  | { kind: 'done'; result: AdoptionResult }
  | { kind: 'failed'; message: string; records: AdoptableRecords }

/**
 * Offers to move this browser's data into a newly signed-in account.
 *
 * Shown only when there is something to move: sample records are excluded by
 * the id rule in `adoption.ts`, so a fresh install with only the demo day
 * never sees this.
 */
export function AdoptionPrompt() {
  const { session, refresh } = useDataRevision()
  const [state, setState] = useState<State>({ kind: 'checking' })

  useEffect(() => {
    if (!session.authenticated || hasAdopted(session.userId)) {
      setState({ kind: 'nothing' })
      return
    }
    let cancelled = false
    void findAdoptableRecords(localRepositories, LOCAL_USER_ID)
      .then((records) => {
        if (cancelled) return
        const total = records.meals.length + records.observations.length
        setState(total > 0 ? { kind: 'offer', records } : { kind: 'nothing' })
      })
      .catch(() => setState({ kind: 'nothing' }))
    return () => {
      cancelled = true
    }
  }, [session.authenticated, session.userId])

  if (state.kind === 'checking' || state.kind === 'nothing') return null

  async function move(records: AdoptableRecords) {
    setState({ kind: 'moving' })
    try {
      const result = await adoptInto(getRepositories(), records, session.userId)
      markAdopted(session.userId)
      refresh()
      setState({ kind: 'done', result })
    } catch (cause) {
      setState({
        kind: 'failed',
        message: cause instanceof Error ? cause.message : 'Something went wrong',
        records,
      })
    }
  }

  if (state.kind === 'done') {
    const { meals, observations, skipped } = state.result
    return (
      <div className="pb-4">
        <Card>
          <p className="text-sm text-leaf">
            Moved {meals} meal{meals === 1 ? '' : 's'}
            {observations > 0 && ` and ${observations} measurement${observations === 1 ? '' : 's'}`}{' '}
            into your account.
            {skipped > 0 && ` ${skipped} were already there.`}
          </p>
          <p className="pt-1 text-xs text-ink-muted">
            The copies in this browser are left untouched.
          </p>
        </Card>
      </div>
    )
  }

  const records = state.kind === 'moving' ? undefined : state.records
  const count = records ? records.meals.length + records.observations.length : 0

  return (
    <div className="pb-4">
      <Card>
        <h2 className="font-display text-xl">Bring your data with you</h2>
        <p className="pt-1 text-sm text-ink-muted">
          {state.kind === 'moving'
            ? 'Moving your records…'
            : `This browser holds ${count} record${count === 1 ? '' : 's'} you logged${
                records && records.days.length > 0 ? ` across ${records.days.length} day${records.days.length === 1 ? '' : 's'}` : ''
              }. Move them into your account so they follow you between devices?`}
        </p>
        {state.kind === 'failed' && (
          <p className="pt-2 text-xs text-accent">{state.message} — nothing was lost, try again.</p>
        )}
        <p className="pt-2 text-xs text-ink-muted">
          The sample day stays behind, and your local copies are not deleted.
        </p>
        <div className="flex flex-wrap gap-3 pt-3">
          <button
            type="button"
            disabled={state.kind === 'moving'}
            onClick={() => records && void move(records)}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {state.kind === 'moving' ? 'Moving…' : 'Move my data'}
          </button>
          {state.kind !== 'moving' && (
            <button
              type="button"
              onClick={() => {
                markAdopted(session.userId)
                setState({ kind: 'nothing' })
              }}
              className="rounded-full border border-hairline px-4 py-2 text-sm"
            >
              Not now
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
