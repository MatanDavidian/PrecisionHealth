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

const dayAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function seedWeek() {
  const db = openHealthDB()
  open = await db
  const repos = createIndexedDbRepositories(db)
  for (let i = 6; i >= 0; i--) {
    const at = dayAgo(i)
    at.setHours(13, 0, 0, 0)
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
        { code: 'ACTIVE_ENERGY', value: 2400, unit: 'kcal', day: key(at) },
        ZONE,
      ),
    )
  }
  return { repos, today: key(dayAgo(0)) }
}

describe('the week report', () => {
  it('covers seven days ending on the day asked for', async () => {
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', undefined, repos)
    expect(report.days).toHaveLength(7)
    expect(report.to).toBe(today)
  })

  it('carries the foods as logged — the most useful thing in it', async () => {
    const { today, repos } = await seedWeek()
    const report = await readWeekReport(USER, today, 'LOSE_WEIGHT', undefined, repos)
    expect(report.days.at(-1)!.meals[0].foods).toEqual(['Rice', 'Chicken'])
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
    const older = await readWeekReport(USER, key(dayAgo(9)), 'LOSE_WEIGHT', undefined, repos)
    expect(report.days.every((d) => d.burnedKcal !== undefined)).toBe(true)
    expect(older.days.some((d) => d.burnedKcal === undefined)).toBe(true)
  })
})
