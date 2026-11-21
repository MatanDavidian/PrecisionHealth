import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { buildGoal, buildObjectiveGoal, buildObservation } from '../newRecords'
import { dailyBurns, readDailyTargets } from '../targets'
import {
  addDays,
  asId,
  canonical,
  deviceReading,
  type CalendarDate,
  type Observation,
  type ObservationId,
  type UserId,
} from '@/domain'

/**
 * The daily targets, read from a real store (docs/features/daily-targets.md).
 *
 * The rules are pinned in src/domain/__tests__/targets.test.ts; these prove
 * the right things are fetched to feed them: the watch's burn from the four
 * weeks BEFORE the day, the latest weight, the goals, the profile.
 */

const USER = 'user-targets' as UserId
const ZONE = 'Asia/Jerusalem'
const DAY = '2026-09-30' as CalendarDate

let open: IDBPDatabase<HealthDB> | undefined
afterEach(() => {
  open?.close()
  open = undefined
})
beforeEach(async () => {
  await deleteDB(DB_NAME)
})

async function store() {
  const db = openHealthDB()
  open = await db
  return createIndexedDbRepositories(db)
}

const watchBurn = (day: CalendarDate, kcal: number, n: number): Observation => ({
  id: asId<'Observation'>(`burn-${n}`) as ObservationId,
  userId: USER,
  code: 'TOTAL_ENERGY',
  time: { kind: 'daily', date: day, zone: ZONE },
  value: canonical(kcal, 'kcal'),
  provenance: deviceReading('GARMIN', `${day}T20:50:00.000Z`),
})

describe('reading the daily targets', () => {
  it('reports everything missing for an empty account', async () => {
    const repos = await store()
    const { result } = await readDailyTargets(USER, DAY, repos)
    expect(result).toEqual({ ok: false, missing: ['OBJECTIVE', 'WEIGHT', 'BURN'] })
  })

  it('averages the watch over the days before, and ignores the day itself', async () => {
    const repos = await store()
    await repos.goals.add(buildObjectiveGoal(USER, 'LOSE_FAT', ZONE))
    await repos.observations.add(buildObservation(USER, { code: 'WEIGHT', value: 80, unit: 'kg', day: DAY }, ZONE))
    for (let back = 1; back <= 6; back += 1) await repos.observations.add(watchBurn(addDays(DAY, -back), 2600, back))
    // The day shown: half finished, and must not count.
    await repos.observations.add(watchBurn(DAY, 900, 0))
    // Older than four weeks: outside the window.
    await repos.observations.add(watchBurn(addDays(DAY, -40), 5000, 40))

    const { result } = await readDailyTargets(USER, DAY, repos)
    if (!result.ok) throw new Error('expected targets')
    expect(result.targets.burn).toEqual({ kind: 'MEASURED', kcal: 2600, days: 6 })
    expect(result.targets.energyKcal).toBe(2250) // 2600 − 350
    expect(result.targets.proteinG).toBe(160) // 2.0 × 80
  })

  it('uses the profile when there is no watch, and the protein goal when one is set', async () => {
    const repos = await store()
    await repos.goals.add(buildObjectiveGoal(USER, 'MAINTAIN', ZONE))
    await repos.goals.add(buildGoal(USER, { metric: 'PROTEIN', target: 150, unit: 'g', direction: 'AT_LEAST' }, ZONE))
    await repos.observations.add(buildObservation(USER, { code: 'WEIGHT', value: 60, unit: 'kg', day: DAY }, ZONE))
    await repos.profiles.save({
      userId: USER,
      displayName: '',
      timezone: ZONE,
      preferredMassUnit: 'kg',
      preferredLengthUnit: 'cm',
      height: { value: 165, unit: 'cm' },
      birthYear: 1996,
      sex: 'FEMALE',
      activity: 'LOW',
    })

    const { result } = await readDailyTargets(USER, DAY, repos)
    if (!result.ok) throw new Error('expected targets')
    // (10 × 60 + 6.25 × 165 − 5 × 30 − 161) × 1.3 = 1716.3
    expect(result.targets.burn.kind).toBe('ESTIMATED')
    expect(result.targets.energyKcal).toBe(1720)
    expect(result.targets.proteinG).toBe(150)
    expect(result.targets.protein).toEqual({ from: 'GOAL' })
  })

  it('a burn typed on Today counts as that day, beside the watch', () => {
    const typed = buildObservation(USER, { code: 'TOTAL_ENERGY', value: 2000, unit: 'kcal', day: '2026-09-20' as CalendarDate }, ZONE)
    const watch = watchBurn('2026-09-21' as CalendarDate, 2400, 1)
    expect(dailyBurns([typed, watch]).sort()).toEqual([2000, 2400])
  })
})
