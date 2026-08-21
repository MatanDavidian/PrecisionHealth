import { useCallback, useEffect, useState } from 'react'
import { repositories } from '@/data'
import { currentUserId } from '@/data/session'
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
  detectMealConflicts,
  latestVersions,
  nextVersion,
  resolveMealConflict,
  liveItems,
  type Conflict,
  type FoodItem,
  type MealConflict,
  type Goal,
  type Meal,
  type Nutrients,
  type Observation,
  type Sleep,
  type Workout,
} from '@/domain'
import { useDataRevision } from './DataProvider'

/** Sort key for a record's time, whichever shape it has. */
const instantOf = (time: Meal['time']): string =>
  time.kind === 'daily' ? time.date : time.kind === 'interval' ? time.start : time.at

export interface DayData {
  day: string
  nutrients: Nutrients
  /** Latest version of each meal, superseded items already removed. */
  meals: Meal[]
  /** Meals two devices edited from the same base (D15). */
  mealConflicts: MealConflict[]
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
        repositories.meals.listByDay(currentUserId(), day),
        repositories.workouts.listByDay(currentUserId(), day),
        repositories.sleep.forDay(currentUserId(), day),
        repositories.goals.listActive(currentUserId()),
        ...TRACKED.map((code) => repositories.observations.listByDay(currentUserId(), day, code)),
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

      // The store returns every version; take the newest of each meal, then
      // drop superseded items inside it, so a confirmed correction replaces
      // the estimate rather than double-counting with it. Sorted by time so
      // the day reads as a timeline, not in insertion order.
      const live = latestVersions(meals)
        .map((meal) => ({ ...meal, items: liveItems(meal.items) }))
        .sort((a, b) => instantOf(a.time).localeCompare(instantOf(b.time)))

      setData({
        day,
        meals: live,
        mealConflicts: detectMealConflicts(meals),
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
  const { runWrite } = useDataRevision()

  const addMeal = useCallback(
    async (input: MealInput) => {
      await runWrite('this meal', () => repositories.meals.add(buildMeal(currentUserId(), input)))
    },
    [runWrite],
  )

  /** D6: settling a disagreement writes a new record superseding every candidate. */
  const resolveConflict = useCallback(
    async (chosen: Observation, candidates: Observation[]) => {
      await runWrite('your choice', () =>
        repositories.observations.add(
          confirmObservation(chosen, candidates, new Date().toISOString(), newId),
        ),
      )
    },
    [runWrite],
  )

  /** D4: confirming an AI estimate appends a confirmed item superseding it. */
  /** D4 inside the meal (the item supersedes), D15 outside it (a new version). */
  const confirmEstimate = useCallback(
    async (meal: Meal, item: FoodItem) => {
      const confirmed = confirmFoodItem(item, new Date().toISOString(), newId)
      const next = nextVersion(meal, { items: [...meal.items, confirmed] }, newId)
      await runWrite('this confirmation', () => repositories.meals.add(next))
    },
    [runWrite],
  )

  /** The user settled a same-version disagreement; their pick becomes the next version. */
  const resolveMealVersion = useCallback(
    async (chosen: Meal, conflict: MealConflict) => {
      await runWrite('your choice', () =>
        repositories.meals.add(resolveMealConflict(chosen, conflict, newId)),
      )
    },
    [runWrite],
  )

  return { addMeal, resolveConflict, confirmEstimate, resolveMealVersion }
}
