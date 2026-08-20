import { useCallback, useEffect, useState } from 'react'
import { repositories } from '@/data'
import { DEMO_USER_ID } from '@/data/mock/seed'
import { buildMeal, newId, type MealInput } from '@/data/newRecords'
import {
  effectiveObservation,
  observationConflict,
  totalNutrients,
  unconfirmedItems,
} from '@/data/analytics'
import {
  confirmFoodItem,
  confirmObservation,
  dayKey,
  liveItems,
  type Conflict,
  type FoodItem,
  type Goal,
  type Meal,
  type Nutrients,
  type Observation,
  type Sleep,
  type Workout,
} from '@/domain'
import { useDataRevision } from './DataProvider'
import { deviceZone } from '@/data/newRecords'

/** Sort key for a record's time, whichever shape it has. */
const instantOf = (time: Meal['time']): string =>
  time.kind === 'daily' ? time.date : time.kind === 'interval' ? time.start : time.at

/** The day being viewed. Slice 1 shows today only; a date picker comes with slice 2. */
export const today = (): string => dayKey(new Date().toISOString(), deviceZone())

export interface DayData {
  day: string
  nutrients: Nutrients
  meals: Meal[]
  unconfirmed: FoodItem[]
  workouts: Workout[]
  sleep?: Sleep
  effective: Partial<Record<Observation['code'], Observation>>
  conflicts: Conflict<Observation>[]
  /** Kept so a confirmation can supersede every candidate, not just the winner. */
  candidates: Partial<Record<Observation['code'], Observation[]>>
  goals: Goal[]
}

const TRACKED = ['STEPS', 'ACTIVE_ENERGY', 'HRV', 'RESTING_HEART_RATE', 'WEIGHT', 'BODY_FAT'] as const

export function useDay(day: string) {
  const { revision } = useDataRevision()
  const [data, setData] = useState<DayData>()

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [meals, workouts, sleepRecords, goals, ...observationSets] = await Promise.all([
        repositories.meals.listByDay(DEMO_USER_ID, day),
        repositories.workouts.listByDay(DEMO_USER_ID, day),
        repositories.sleep.forDay(DEMO_USER_ID, day),
        repositories.goals.listActive(DEMO_USER_ID),
        ...TRACKED.map((code) => repositories.observations.listByDay(DEMO_USER_ID, day, code)),
      ])
      if (cancelled) return

      const effective: DayData['effective'] = {}
      const candidates: DayData['candidates'] = {}
      const conflicts: Conflict<Observation>[] = []

      observationSets.forEach((set, index) => {
        const code = TRACKED[index]
        candidates[code] = set
        const winner = effectiveObservation(set)
        if (winner) effective[code] = winner
        const conflict = observationConflict(set)
        if (conflict) conflicts.push(conflict)
      })

      // Superseded items are excluded before anything is summed, so a confirmed
      // correction replaces the estimate rather than double-counting with it.
      // Sorted by time so the day reads as a timeline, not in insertion order.
      const live = meals
        .map((meal) => ({ ...meal, items: liveItems(meal.items) }))
        .sort((a, b) => instantOf(a.time).localeCompare(instantOf(b.time)))

      setData({
        day,
        meals: live,
        nutrients: totalNutrients(live),
        unconfirmed: unconfirmedItems(live),
        workouts,
        sleep: sleepRecords[0],
        effective,
        candidates,
        conflicts,
        goals,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [day, revision])

  return data
}

/** Write actions. Each one persists, then bumps the revision so reads re-run. */
export function useActions() {
  const { refresh } = useDataRevision()

  const addMeal = useCallback(
    async (input: MealInput) => {
      await repositories.meals.add(buildMeal(DEMO_USER_ID, input))
      refresh()
    },
    [refresh],
  )

  /** D6: settling a disagreement writes a new record superseding every candidate. */
  const resolveConflict = useCallback(
    async (chosen: Observation, candidates: Observation[]) => {
      await repositories.observations.add(
        confirmObservation(chosen, candidates, new Date().toISOString(), newId),
      )
      refresh()
    },
    [refresh],
  )

  /** D4: confirming an AI estimate appends a confirmed item superseding it. */
  const confirmEstimate = useCallback(
    async (meal: Meal, item: FoodItem) => {
      const confirmed = confirmFoodItem(item, new Date().toISOString(), newId)
      await repositories.meals.add({ ...meal, items: [...meal.items, confirmed] })
      refresh()
    },
    [refresh],
  )

  return { addMeal, resolveConflict, confirmEstimate }
}
