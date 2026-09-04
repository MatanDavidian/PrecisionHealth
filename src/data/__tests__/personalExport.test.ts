import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { deleteDB, type IDBPDatabase } from 'idb'
import {
  buildPersonalExport,
  collectPersonalExport,
  EXPORT_FORMAT,
  exportFilename,
  redactSettings,
} from '../personalExport'
import type { PersonalRecords } from '../repositories'
import { createIndexedDbRepositories, eraseLocalRecords } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { canonical, userEntered, type Meal, type MealId, type UserId } from '@/domain'

const USER = 'user-export' as UserId

const empty = (): PersonalRecords => ({
  meals: [],
  workouts: [],
  sleep: [],
  observations: [],
  goals: [],
  labPanels: [],
  conditions: [],
  regimens: [],
  intakeEvents: [],
  inferences: [],
})

const settings = { model: 'gpt-5.6', autoAnalyze: true, apiKey: 'sk-a-real-secret', language: 'he' as const }

describe('what goes in the file', () => {
  it('never writes the API key, and says that it did not', () => {
    const file = buildPersonalExport(empty(), settings, { userId: USER, authenticated: false })

    // The whole point: an export is a file people email to themselves.
    expect(JSON.stringify(file)).not.toContain('sk-a-real-secret')
    expect(file.settings.apiKeySet).toBe(true)
    expect('apiKey' in file.settings).toBe(false)
    // The rest of the settings are still there — this is a redaction, not a drop.
    expect(file.settings.model).toBe('gpt-5.6')
    expect(file.settings.language).toBe('he')
  })

  it('reports no key as no key, rather than as a redacted one', () => {
    const { apiKey, ...withoutKey } = settings
    void apiKey
    expect(redactSettings(withoutKey).apiKeySet).toBe(false)
  })

  it('counts what it holds, so an empty file can be told from a broken one', () => {
    const records = empty()
    records.meals = [meal('m1'), meal('m2')]
    const file = buildPersonalExport(records, settings, { userId: USER, authenticated: true })

    expect(file.counts.meals).toBe(2)
    expect(file.counts.sleep).toBe(0)
    expect(file.counts.profile).toBe(0)
  })

  it('names itself, so a reader knows what they have', () => {
    const file = buildPersonalExport(empty(), settings, { userId: USER, authenticated: true })
    expect(file.format).toBe(EXPORT_FORMAT)
    expect(file.version).toBe(1)
    expect(file.notes.some((note) => /API key/i.test(note))).toBe(true)
    // Someone opening this a year later will not have the release notes.
    expect(file.notes.some((note) => /append-only|versions/i.test(note))).toBe(true)
  })

  it('dates the filename so a folder of them sorts', () => {
    expect(exportFilename('2026-09-04T11:22:33.000Z')).toBe('timeline-export-2026-09-04.json')
  })
})

describe('assembling it from a real store', () => {
  /*
    One connection per test, closed afterwards.

    `deleteDB` waits for every open handle before it will drop the database, so
    a test that opens a second one and walks away does not fail — it hangs, and
    the NEXT test is the one that times out.
  */
  let connection: IDBPDatabase<HealthDB> | undefined

  beforeEach(async () => {
    connection?.close()
    await deleteDB(DB_NAME)
  })
  afterEach(() => {
    connection?.close()
    connection = undefined
  })

  const store = async () => {
    const db = openHealthDB()
    connection = await db
    return { db, repositories: createIndexedDbRepositories(db) }
  }

  it('reads every day, not a window, and then erases on request', async () => {
    const { db, repositories } = await store()

    // Two meals eleven months apart. Any range-based assembly misses one.
    await repositories.meals.add(meal('january', '2026-01-04'))
    await repositories.meals.add(meal('december', '2026-12-19'))

    const file = await collectPersonalExport(
      repositories,
      { userId: USER, email: 'someone@example.com', authenticated: true },
      '2027-01-01T00:00:00.000Z',
    )
    expect(file.meals.map((m) => m.id).sort()).toEqual(['december', 'january'])
    expect(file.counts.meals).toBe(2)
    expect(file.account.email).toBe('someone@example.com')

    await eraseLocalRecords(db, USER)
    expect((await repositories.account.everything(USER)).meals).toHaveLength(0)
  })

  it('erases one person without touching another', async () => {
    const { db, repositories } = await store()
    const other = 'user-someone-else' as UserId

    await repositories.meals.add(meal('mine', '2026-03-01'))
    await repositories.meals.add({ ...meal('theirs', '2026-03-01'), userId: other })

    await eraseLocalRecords(db, USER)

    expect((await repositories.account.everything(USER)).meals).toHaveLength(0)
    // A wipe that took the whole store would look identical from one account.
    expect((await repositories.account.everything(other)).meals).toHaveLength(1)
  })

  it('leaves settings alone, because a key is not a health record', async () => {
    const { db, repositories } = await store()
    await repositories.settings.save({ apiKey: 'sk-still-mine', model: 'gpt-5.6' })
    await repositories.meals.add(meal('gone', '2026-04-01'))

    await eraseLocalRecords(db, USER)

    // Erasing your records should not silently sign you out of OpenAI too.
    expect((await repositories.settings.get()).apiKey).toBe('sk-still-mine')
  })
})

function meal(id: string, day = '2026-09-04'): Meal {
  return {
    id: id as MealId,
    recordId: `${id}-v1`,
    version: 1,
    userId: USER,
    slot: 'LUNCH',
    time: { kind: 'instant', at: `${day}T10:00:00.000Z`, zone: 'Asia/Jerusalem' },
    items: [
      {
        id: `${id}-item` as Meal['items'][number]['id'],
        mealId: id as MealId,
        name: 'Rice',
        amount: canonical(200, 'g'),
        nutrients: {
          energy: canonical(260, 'kcal'),
          protein: canonical(5, 'g'),
          carbs: canonical(56, 'g'),
          fat: canonical(1, 'g'),
        },
        provenance: userEntered(`${day}T10:00:00.000Z`),
      },
    ],
    provenance: userEntered(`${day}T10:00:00.000Z`),
  }
}
