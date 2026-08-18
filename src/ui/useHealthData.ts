import { useEffect, useState } from 'react'
import { inMemoryRepositories } from '@/data/mock/inMemoryRepositories'
import { DEMO_DATE, DEMO_USER_ID } from '@/data/mock/seed'
import { totalNutrients, hasUnconfirmedEstimate } from '@/data/analytics'
import type { Goal, Meal, Measurement, Nutrients, Observation, Sleep, Workout } from '@/domain'

export interface TodayData {
  nutrients: Nutrients
  meals: Meal[]
  estimatesPending: boolean
  workouts: Workout[]
  sleep?: Sleep
  observations: Observation[]
  measurements: Measurement[]
  goals: Goal[]
}

/**
 * Loads a day through the repository interfaces only — no screen ever reaches
 * past this boundary, so the mock store can be replaced by the API later.
 */
export function useToday() {
  const [data, setData] = useState<TodayData>()

  useEffect(() => {
    let cancelled = false
    const repos = inMemoryRepositories

    async function load() {
      const [meals, workouts, sleep, observations, goals, weight, bodyFat] = await Promise.all([
        repos.meals.listByDate(DEMO_USER_ID, DEMO_DATE),
        repos.workouts.listByDate(DEMO_USER_ID, DEMO_DATE),
        repos.sleep.latest(DEMO_USER_ID),
        repos.observations.listByDate(DEMO_USER_ID, DEMO_DATE),
        repos.goals.listActive(DEMO_USER_ID),
        repos.measurements.latest(DEMO_USER_ID, 'WEIGHT'),
        repos.measurements.latest(DEMO_USER_ID, 'BODY_FAT'),
      ])
      if (cancelled) return
      setData({
        meals,
        nutrients: totalNutrients(meals),
        estimatesPending: hasUnconfirmedEstimate(meals),
        workouts,
        sleep,
        observations,
        goals,
        measurements: [weight, bodyFat].filter((m): m is Measurement => m != null),
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return data
}
