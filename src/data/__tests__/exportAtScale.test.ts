import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseRepositories } from '../supabase/supabaseRepositories'
import { collectPersonalExport } from '../personalExport'
import { meals as sampleMeals } from '../mock/seed'
import type { SettingsRepository } from '../repositories'
import type { Meal, UserId } from '@/domain'

/**
 * Years of history, exported (docs/PHASE-1-FINISH.md, edge scenarios).
 *
 * Five meals a day for 25 years is about 50,000 rows, past fifty of the
 * thousand-row pages PostgREST will return. The export must read every one
 * exactly once — a short export is silent data loss for exactly the people
 * with the most to lose — and still be a file a phone can build.
 */
const USER = 'user-scale' as UserId
const MEALS = 50_000

const meals: Meal[] = Array.from({ length: MEALS }, (_, n) => {
  const template = sampleMeals[n % sampleMeals.length]
  const id = `meal-${String(n).padStart(6, '0')}`
  return { ...template, id, recordId: id, version: 1 } as Meal
})

/** Just enough PostgREST: filters ignored, `range` honoured, every request counted. */
function fakeClient(tables: Record<string, unknown[]>) {
  const requests: { table: string; from: number; to: number }[] = []
  const client = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: async (from: number, to: number) => {
          requests.push({ table, from, to })
          return { data: (tables[table] ?? []).slice(from, to + 1).map((data) => ({ data })), error: null }
        },
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, requests }
}

const settings = {
  get: async () => ({ model: 'gpt-6.1-sol', autoAnalyze: true, language: 'en' as const }),
} as unknown as SettingsRepository

describe('an export of years of history', () => {
  it('reads all 50,000 meals, each once, a thousand at a time', async () => {
    const { client, requests } = fakeClient({ meals })
    const repositories = { ...createSupabaseRepositories(client, settings), settings }

    const file = await collectPersonalExport(
      repositories,
      { userId: USER, email: 'scale@example.com', authenticated: true },
      '2026-10-17T12:00:00.000Z',
    )

    expect(file.meals).toHaveLength(MEALS)
    expect(new Set(file.meals.map((meal) => meal.recordId)).size).toBe(MEALS)
    const mealPages = requests.filter((request) => request.table === 'meals')
    // 50 full pages, and the empty 51st that says there is no more.
    expect(mealPages).toHaveLength(51)
    expect(mealPages.every((page) => page.to - page.from === 999)).toBe(true)
  })

  it('makes a file a phone can build: bounded in size and time', async () => {
    const { client } = fakeClient({ meals })
    const repositories = { ...createSupabaseRepositories(client, settings), settings }
    const started = performance.now()
    const file = await collectPersonalExport(
      repositories,
      { userId: USER, email: 'scale@example.com', authenticated: true },
      '2026-10-17T12:00:00.000Z',
    )
    // As AccountData.tsx writes it.
    const text = JSON.stringify(file, null, 2)
    const elapsed = performance.now() - started
    const megabytes = text.length / 1_000_000

    console.info(`50,000 meals: ${megabytes.toFixed(1)} MB in ${Math.round(elapsed)} ms`)
    // Well inside what a phone browser will hold as one string (hundreds of MB).
    expect(megabytes).toBeLessThan(150)
    expect(elapsed).toBeLessThan(15_000)
  })
})
