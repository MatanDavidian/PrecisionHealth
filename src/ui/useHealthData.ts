import { useCallback, useEffect, useState } from 'react'
import { getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import {
  buildGoal,
  buildMeal,
  buildObjectiveGoal,
  buildObservation,
  deviceZone,
  newId,
  type GoalInput,
  type MealInput,
  type ObservationInput,
} from '@/data/newRecords'
import {
  effectiveObservation,
  observationConflict,
  totalNutrients,
  unconfirmedItems,
} from '@/data/analytics'
import {
  applyMealEdit,
  confirmFoodItem,
  confirmObservation,
  mealFromFoods,
  repeatDay,
  repeatMeal,
  retractMeal,
  dayKey,
  detectMealConflicts,
  latestVersions,
  nextVersion,
  resolveMealConflict,
  restoreMeal,
  liveItems,
  type Conflict,
  type FoodItem,
  type MealConflict,
  type MealEdit,
  type MealSlot,
  type UsualFood,
  type UsualMeal,
  type Goal,
  type Meal,
  type Nutrients,
  type Objective,
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

const TRACKED = [
  'STEPS',
  'ACTIVE_ENERGY',
  'TOTAL_ENERGY',
  'HRV',
  'RESTING_HEART_RATE',
  'WEIGHT',
  'BODY_FAT',
] as const

export interface DayState {
  data?: DayState extends never ? never : DayData
  /**
   * Set when the day could not be read at all.
   *
   * Reads used to be local and effectively infallible, so a failure left the
   * screen on "Loading…" forever. Across a network that is a lie — the app
   * must say it cannot reach the data rather than pretend it is still coming.
   */
  error?: string
  retry: () => void
}

export function useDay(day: string): DayState {
  const { revision } = useDataRevision()
  const [data, setData] = useState<DayData>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [meals, workouts, sleepRecords, goals, ...observationSets] = await Promise.all([
        getRepositories().meals.listByDay(currentUserId(), day),
        getRepositories().workouts.listByDay(currentUserId(), day),
        getRepositories().sleep.forDay(currentUserId(), day),
        getRepositories().goals.listActive(currentUserId()),
        ...TRACKED.map((code) => getRepositories().observations.listByDay(currentUserId(), day, code)),
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

    setError(undefined)
    load().catch((cause: unknown) => {
      if (cancelled) return
      // Keep whatever was already on screen: a stale day plus an explicit
      // failure is more useful than a blank one.
      setError(cause instanceof Error ? cause.message : 'Could not reach your data')
    })

    return () => {
      cancelled = true
    }
  }, [day, revision, attempt])

  return { data, error, retry: () => setAttempt((n) => n + 1) }
}

/** Write actions. Each one persists, then bumps the revision so reads re-run. */
export function useActions() {
  const { runWrite } = useDataRevision()

  const addMeal = useCallback(
    async (input: MealInput) => {
      await runWrite('this meal', () => getRepositories().meals.add(buildMeal(currentUserId(), input)))
    },
    [runWrite],
  )

  /** D6: settling a disagreement writes a new record superseding every candidate. */
  /**
   * A measurement the user typed: today's weight, yesterday's calories burned.
   *
   * An ordinary observation with USER provenance, so it sits in the same
   * precedence order as anything a device will send later (D6) — and if a
   * watch ever disagrees with it, that becomes a conflict the user settles
   * rather than a number silently overwritten.
   */
  const recordObservation = useCallback(
    async (input: ObservationInput) => {
      await runWrite('that measurement', () =>
        getRepositories().observations.add(buildObservation(currentUserId(), input)),
      )
    },
    [runWrite],
  )

  /**
   * Sets a target. Appends rather than edits, so what you used to be aiming
   * for stays readable (D4); `currentGoals` picks the newest per metric.
   */
  const setGoal = useCallback(
    async (input: GoalInput) => {
      await runWrite('that goal', () =>
        getRepositories().goals.add(buildGoal(currentUserId(), input)),
      )
    },
    [runWrite],
  )

  /** Records which programme the user is on, as an ENERGY goal (D4: appended). */
  const setObjective = useCallback(
    async (objective: Objective) => {
      await runWrite('that goal', () =>
        getRepositories().goals.add(buildObjectiveGoal(currentUserId(), objective)),
      )
    },
    [runWrite],
  )

  const resolveConflict = useCallback(
    async (chosen: Observation, candidates: Observation[]) => {
      await runWrite('your choice', () =>
        getRepositories().observations.add(
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
      await runWrite('this confirmation', () => getRepositories().meals.add(next))
    },
    [runWrite],
  )

  /** The user settled a same-version disagreement; their pick becomes the next version. */
  const resolveMealVersion = useCallback(
    async (chosen: Meal, conflict: MealConflict) => {
      await runWrite('your choice', () =>
        getRepositories().meals.add(resolveMealConflict(chosen, conflict, newId)),
      )
    },
    [runWrite],
  )

  /**
   * Logs a meal you have eaten before.
   *
   * No photo, no model, no estimate to review — the numbers were already
   * settled the first time. Returns the meal so the caller can offer Undo.
   */
  const logRepeat = useCallback(
    async (usual: UsualMeal, slot: MealSlot): Promise<Meal | undefined> => {
      const meal = repeatMeal(usual.template, currentUserId(), {
        at: new Date(),
        zone: deviceZone(),
        slot,
        newId,
      })
      const ok = await runWrite('this meal', () => getRepositories().meals.add(meal))
      return ok ? meal : undefined
    },
    [runWrite],
  )

  /** Logs several single foods as one meal. */
  const logFoods = useCallback(
    async (foods: UsualFood[], slot: MealSlot): Promise<Meal | undefined> => {
      const meal = mealFromFoods(foods, currentUserId(), {
        at: new Date(),
        zone: deviceZone(),
        slot,
        newId,
      })
      const ok = await runWrite('these foods', () => getRepositories().meals.add(meal))
      return ok ? meal : undefined
    },
    [runWrite],
  )

  /**
   * Repeats a whole day of meals, each at the time of day it was eaten.
   *
   * Returns what was written so the caller can offer Undo over all of it —
   * one tap in, one tap out.
   */
  const logDay = useCallback(
    async (source: Meal[]): Promise<Meal[]> => {
      const zone = deviceZone()
      const now = new Date()
      const { meals } = repeatDay(source, currentUserId(), {
        onDate: dayKey(now.toISOString(), zone),
        zone,
        now,
        newId,
      })
      const ok = await runWrite('these meals', async () => {
        for (const meal of meals) await getRepositories().meals.add(meal)
      })
      return ok ? meals : []
    },
    [runWrite],
  )

  /**
   * The user corrected a meal they had already logged.
   *
   * One write, whatever changed: `applyMealEdit` turns the form into the next
   * version of the meal, with corrected foods superseding the originals inside
   * it (D4, D15). Nothing is overwritten, so an edit is as recoverable as
   * everything else here.
   */
  const editMeal = useCallback(
    async (meal: Meal, edit: MealEdit) => {
      const next = applyMealEdit(meal, edit, new Date().toISOString(), newId)
      await runWrite('your changes', () => getRepositories().meals.add(next))
    },
    [runWrite],
  )

  /**
   * Takes a meal back.
   *
   * Records are append-only (D4), so this appends a version marked retracted
   * rather than deleting anything — readers skip it, history keeps it, and a
   * mis-tap is recoverable (Q7).
   *
   * Returns the retraction so the caller can offer Undo: putting the meal back
   * needs the record that took it away, not the one the user was looking at.
   */
  const deleteMeal = useCallback(
    async (meal: Meal): Promise<Meal | undefined> => {
      const retraction = retractMeal(meal, newId)
      const ok = await runWrite('that change', () => getRepositories().meals.add(retraction))
      return ok ? retraction : undefined
    },
    [runWrite],
  )

  /** Takes back everything a whole-day repeat wrote. */
  const deleteMeals = useCallback(
    async (meals: Meal[]) => {
      await runWrite('that change', async () => {
        for (const meal of meals) await getRepositories().meals.add(retractMeal(meal, newId))
      })
    },
    [runWrite],
  )

  /** Undoes a delete: another version, saying the meal happened after all. */
  const undeleteMeal = useCallback(
    async (retraction: Meal) => {
      await runWrite('that change', () =>
        getRepositories().meals.add(restoreMeal(retraction, newId)),
      )
    },
    [runWrite],
  )

  return {
    addMeal,
    recordObservation,
    setGoal,
    setObjective,
    resolveConflict,
    confirmEstimate,
    resolveMealVersion,
    editMeal,
    logRepeat,
    logFoods,
    logDay,
    deleteMeal,
    deleteMeals,
    undeleteMeal,
  }
}
