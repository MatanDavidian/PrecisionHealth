import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import { DEMO_DAY, DEMO_USER_ID } from '@/data/mock/seed'
import {
  effectiveObservation,
  observationConflict,
  totalNutrients,
  unconfirmedItems,
} from '@/data/analytics'
import type { Conflict, FoodItem, Goal, Meal, Nutrients, Observation, Sleep, Workout } from '@/domain'

export interface TodayData {
  nutrients: Nutrients
  meals: Meal[]
  unconfirmed: FoodItem[]
  workouts: Workout[]
  sleep?: Sleep
  /** Already resolved by precedence. */
  effective: Partial<Record<Observation['code'], Observation>>
  /** Raised only when sources disagree beyond the metric's tolerance. */
  conflicts: Conflict<Observation>[]
  goals: Goal[]
}

const TRACKED = ['STEPS', 'ACTIVE_ENERGY', 'HRV', 'RESTING_HEART_RATE', 'WEIGHT', 'BODY_FAT'] as const

export function useToday() {
  const [data, setData] = useState<TodayData>()

  useEffect(() => {
    let cancelled = false
    const repos = repositories

    async function load() {
      const [meals, workouts, sleepRecords, goals, ...observationSets] = await Promise.all([
        repos.meals.listByDay(DEMO_USER_ID, DEMO_DAY),
        repos.workouts.listByDay(DEMO_USER_ID, DEMO_DAY),
        repos.sleep.forDay(DEMO_USER_ID, DEMO_DAY),
        repos.goals.listActive(DEMO_USER_ID),
        ...TRACKED.map((code) => repos.observations.listByDay(DEMO_USER_ID, DEMO_DAY, code)),
      ])
      if (cancelled) return

      const effective: TodayData['effective'] = {}
      const conflicts: Conflict<Observation>[] = []

      observationSets.forEach((candidates) => {
        const winner = effectiveObservation(candidates)
        if (winner) effective[winner.code] = winner
        const conflict = observationConflict(candidates)
        if (conflict) conflicts.push(conflict)
      })

      setData({
        meals,
        nutrients: totalNutrients(meals),
        unconfirmed: unconfirmedItems(meals),
        workouts,
        sleep: sleepRecords[0],
        effective,
        conflicts,
        goals,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return data
}
