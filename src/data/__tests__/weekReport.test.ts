import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { readWeekReport } from '../week'
import { buildMeal, buildObservation } from '../newRecords'
import { reportMealCount, type UserId } from '@/domain'

const USER = 'user-demo' as UserId
const ZONE = 'Asia/Jerusalem'

let open: IDBPDatabase<HealthDB> | undefined
afterEach(() => {
  open?.close()
  open = undefined
})
beforeEach(async () => {
  await deleteDB(DB_NAME)
})

/**
 * A fixed calendar week: Sunday 30 Aug to Saturday 5 Sep 2026.
 *
 * Pinned rather than relative to today, because the report now covers the
 * calendar week a day falls in — so a suite seeded "the last seven days" would
 * straddle two weeks, and would do it differently depending on which day it
 * ran. A test whose answer depends on the wall clock is a test that fails on a
 * Sunday.
 */
const WEEK = [
  '2026-08-30',
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
] as const
/** A Wednesday, to prove the week is found from any day inside it. */
const MIDWEEK = '2026-09-02'

async function seedWeek() {
  const db = openHealthDB()
  open = await db
  const repos = createIndexedDbRepositories(db)
  for (const day of WEEK) {
    const at = new Date(`${day}T13:00:00+03:00`)
    await repos.meals.add(
      buildMeal(
        USER,
        {
          slot: 'LUNCH',
          at,
          items: [
            { name: 'Rice', amount: 200, energyKcal: 600, proteinG: 20, carbsG: 90, fatG: 10 },
            { name: 'Chicken', amount: 150, energyKcal: 400, proteinG: 40, carbsG: 0, fatG: 12 },
          ],
        },
        ZONE,
      ),
    )
    await repos.observations.add(
      buildObservation(
        USER,
        { code: 'TOTAL_ENERGY', value: 2400, unit: 'kcal', day },
        ZONE,
      ),
    )
  }
  return { repos, today: MIDWEEK }
}

describe('the week report', () => {
  it('covers the calendar week the day falls in, not the seven days before it', async () => {
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', undefined, repos)
    expect(report.days).toHaveLength(7)
    // Asked about a Wednesday; answered with Sunday to Saturday.
    expect(report.from).toBe('2026-08-30')
    expect(report.to).toBe('2026-09-05')
  })

  it('gives the same report for every day in the week', async () => {
    // This is what lets an insight be saved against a week: the set of days it
    // describes does not move as the days pass.
    const { repos } = await seedWeek()
    const asked = await Promise.all(
      WEEK.map((day) => readWeekReport(USER, day, 'LOSE_WEIGHT', undefined, repos)),
    )
    for (const report of asked) {
      expect([report.from, report.to]).toEqual(['2026-08-30', '2026-09-05'])
    }
  })

  it('carries the foods as logged — the most useful thing in it', async () => {
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', undefined, repos)
    expect(report.days[0].meals[0].foods).toEqual(['Rice', 'Chicken'])
    expect(reportMealCount(report)).toBe(7)
  })

  it('names the weekday, so a weekend pattern needs no calendar arithmetic', async () => {
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', undefined, repos)
    for (const d of report.days) {
      expect(d.weekday).toMatch(/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/)
    }
  })

  it('totals eaten, burned and the net, and scales the aim to reporting days', async () => {
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', undefined, repos)
    expect(report.totals.eatenKcal).toBe(7000)
    expect(report.totals.burnedKcal).toBe(16_800)
    expect(report.totals.netKcal).toBe(-9800)
    expect(report.totals.daysWithBurn).toBe(7)
    expect(report.goal.aimKcal).toBe(-3500)
  })

  it('CONTAINS NO IDENTITY — the promise on the button', async () => {
    // The whole justification for "nothing that says who you are" is that the
    // payload is a fixed shape you can read in one file. This asserts it.
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', { weightKg: 79.4 }, repos)
    const json = JSON.stringify(report)
    expect(json).not.toContain(USER)
    expect(json).not.toContain('userId')
    expect(json).not.toContain('@')
    expect(json).not.toContain('provenance')
    // Ids of any kind would let one report be tied to another.
    expect(json).not.toMatch(/"id"\s*:/)
  })

  it('includes the body figures only when they were set', async () => {
    const { today, repos } = await seedWeek()
    expect((await readWeekReport(USER, today, 'MAINTAIN', undefined, repos)).body).toBeUndefined()
    const withBody = await readWeekReport(USER, today, 'MAINTAIN', { weightKg: 79.44 }, repos)
    expect(withBody.body?.weightKg).toBe(79.4)
  })

  it('leaves a day with no burn undefined rather than zero', async () => {
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', undefined, repos)
    // Nothing was logged before the window, so an 8-day-old end date has gaps.
    const older = await readWeekReport(USER, '2026-08-19', 'LOSE_WEIGHT', undefined, repos)
    expect(report.days.every((d) => d.burnedKcal !== undefined)).toBe(true)
    expect(older.days.some((d) => d.burnedKcal === undefined)).toBe(true)
  })
})

describe('total expenditure is not the tracker’s activity figure', () => {
  it('ignores ACTIVE_ENERGY when totalling the week', async () => {
    // The difference is most of the number — roughly 1,500 kcal a day at rest.
    // Counting the active figure as total would make every week read as a
    // surplus, so the week reads TOTAL_ENERGY and nothing else.
    const db = openHealthDB()
    open = await db
    const repos = createIndexedDbRepositories(db)
    const at = '2026-09-02'
    await repos.observations.add(
      buildObservation(USER, { code: 'ACTIVE_ENERGY', value: 640, unit: 'kcal', day: at }, ZONE),
    )
    const report = await readWeekReport(USER, at, 'MAINTAIN', undefined, repos)
    expect(report.totals.burnedKcal).toBe(0)
    expect(report.totals.daysWithBurn).toBe(0)

    await repos.observations.add(
      buildObservation(USER, { code: 'TOTAL_ENERGY', value: 2400, unit: 'kcal', day: at }, ZONE),
    )
    const withTotal = await readWeekReport(USER, at, 'MAINTAIN', undefined, repos)
    expect(withTotal.totals.burnedKcal).toBe(2400)
    expect(withTotal.totals.daysWithBurn).toBe(1)
  })
})
describe('the totals name the days they cover', () => {
  it('separates what was compared from what was eaten', async () => {
    /*
      The model receives `totals` and `days` together. `days` lists all seven;
      the balance covers only those carrying both figures. Given both and told
      neither, a reader divides by seven — which is exactly what happened, and
      it reported a daily average roughly half the truth in confident prose.

      So the span travels with the numbers.
    */
    const { repos } = await seedWeek()
    const report = await readWeekReport(USER, MIDWEEK, 'LOSE_WEIGHT', undefined, repos)

    expect(report.totals.comparedDays).toBe(report.totals.daysWithBurn)
    expect(report.totals.netKcal).toBe(report.totals.eatenKcal - report.totals.burnedKcal)

    // Everything eaten is at least what was eaten on the compared days, and
    // is reported under a name that says which is which.
    expect(report.totals.eatenAllDaysKcal).toBeGreaterThanOrEqual(report.totals.eatenKcal)
    expect(report.totals.daysWithFood).toBeGreaterThanOrEqual(report.totals.comparedDays)
  })

  it('reports a partial week without pretending it is whole', async () => {
    const { repos } = await seedWeek()
    // A week where only some days were compared: ask about one with gaps.
    const report = await readWeekReport(USER, '2026-08-19', 'LOSE_WEIGHT', undefined, repos)
    expect(report.totals.comparedDays).toBeLessThanOrEqual(report.days.length)
    expect(report.totals.netKcal).toBe(report.totals.eatenKcal - report.totals.burnedKcal)
  })
})
