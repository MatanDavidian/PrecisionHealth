import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { buildPatternFilledDay, ESTIMATED_DAY_NAME } from '../patternFilledDay'
import { readWeek, readWeekReport } from '../week'
import { buildMeal } from '../newRecords'
import { dayKeyOf, type CalendarDate, type TypicalIntake, type UserId } from '@/domain'

const USER = 'user-fill' as UserId
const ZONE = 'Asia/Jerusalem'

const AVERAGE: TypicalIntake = {
  source: 'RECENT',
  drawnFrom: 10,
  energyKcal: 1919.6,
  proteinG: 101.4,
  carbsG: 210.5,
  fatG: 70.2,
}

let open: IDBPDatabase<HealthDB> | undefined
afterEach(() => {
  open?.close()
  open = undefined
})
beforeEach(async () => {
  await deleteDB(DB_NAME)
})

async function repositories() {
  const db = openHealthDB()
  open = await db
  return createIndexedDbRepositories(db)
}

describe('the record a filled day is written as', () => {
  const estimate = buildPatternFilledDay(USER, AVERAGE, '2026-09-01' as CalendarDate, ZONE)

  it('is one number for the day, not a set of meals', () => {
    expect(estimate.items).toHaveLength(1)
    expect(estimate.items[0].name).toBe(ESTIMATED_DAY_NAME)
    expect(estimate.items[0].nutrients.energy.value).toBe(1920)
    expect(estimate.items[0].nutrients.protein.value).toBe(101)
    expect(estimate.items[0].nutrients.carbs.value).toBe(211)
    expect(estimate.items[0].nutrients.fat.value).toBe(70)
  })

  it('is tagged on the meal AND the item, since some readers see only items', () => {
    expect(estimate.provenance.source).toBe('PATTERN_FILL')
    expect(estimate.items[0].provenance.source).toBe('PATTERN_FILL')
  })

  it('lands on the day it fills, in the zone it was filled in', () => {
    expect(dayKeyOf(estimate.time)).toBe('2026-09-01')
  })
})

describe('a filled day in the week', () => {
  // Sunday 30 Aug to Saturday 5 Sep 2026.
  const FILLED = '2026-09-01' as CalendarDate
  const LOGGED_LATER = '2026-09-02' as CalendarDate

  async function seed() {
    const repos = await repositories()
    await repos.meals.add(buildPatternFilledDay(USER, AVERAGE, FILLED, ZONE))
    // Filled, and then the person remembered dinner after all.
    await repos.meals.add(buildPatternFilledDay(USER, AVERAGE, LOGGED_LATER, ZONE))
    await repos.meals.add(
      buildMeal(
        USER,
        {
          slot: 'DINNER',
          at: new Date(`${LOGGED_LATER}T19:30:00+03:00`),
          items: [{ name: 'Pasta', amount: 300, energyKcal: 700, proteinG: 25, carbsG: 100, fatG: 18 }],
        },
        ZONE,
      ),
    )
    return repos
  }

  it('counts the average on a day nothing else was logged', async () => {
    const week = await readWeek(USER, FILLED, undefined, await seed())
    const day = week.days.find((d) => d.day === FILLED)!
    expect(day.eatenKcal).toBe(1920)
    expect(day.estimated).toBe(true)
  })

  it('drops the average once a real meal is logged on the day, rather than adding to it', async () => {
    const week = await readWeek(USER, FILLED, undefined, await seed())
    const day = week.days.find((d) => d.day === LOGGED_LATER)!
    // Not 2,620. The estimate was standing in for the day; the day turned up.
    expect(day.eatenKcal).toBe(700)
    expect(day.estimated).toBe(false)
  })

  it('tells the insights model which day was never logged', async () => {
    const report = await readWeekReport(USER, FILLED, undefined, undefined, await seed())
    expect(report.days.find((d) => d.day === FILLED)?.estimated).toBe(true)
    expect(report.days.find((d) => d.day === LOGGED_LATER)?.estimated).toBeUndefined()
    expect(report.days.find((d) => d.day === LOGGED_LATER)?.meals.map((m) => m.foods)).toEqual([
      ['Pasta'],
    ])
  })
})
