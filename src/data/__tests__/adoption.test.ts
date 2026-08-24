import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories, seedOnce } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { adoptInto, findAdoptableRecords, isGeneratedId } from '../adoption'
import { buildMeal, newId } from '../newRecords'
import { buildSeed } from '../mock/seed'
import { LOCAL_USER_ID } from '../session'
import { canonical, dayKey, deviceReading, nextVersion, type Observation, type UserId } from '@/domain'
import type { HealthRepositories } from '../repositories'

const ACCOUNT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' as UserId
const ZONE = 'Asia/Jerusalem'
const today = () => dayKey(new Date().toISOString(), ZONE)

let connection: IDBPDatabase<HealthDB> | undefined
afterEach(() => {
  connection?.close()
  connection = undefined
})
beforeEach(async () => {
  await deleteDB(DB_NAME)
})

const localStore = async (): Promise<HealthRepositories> => {
  const db = openHealthDB()
  connection = await db
  // Seed exactly as a fresh install does, so the demo day is present.
  await seedOnce(db, buildSeed(today(), ZONE))
  return createIndexedDbRepositories(db)
}

/** A stand-in for the account: same interface, separate storage. */
const remoteStore = (): { repositories: HealthRepositories; rows: { meals: unknown[]; observations: unknown[] } } => {
  const meals: any[] = []
  const observations: any[] = []
  const repositories = {
    meals: {
      add: async (meal: any) => {
        if (meals.some((m) => m.recordId === meal.recordId)) throw new Error('duplicate')
        meals.push(meal)
      },
      listByDay: async () => meals,
      listByRange: async () => meals,
    },
    observations: {
      add: async (observation: any) => {
        if (observations.some((o) => o.id === observation.id)) throw new Error('duplicate')
        observations.push(observation)
      },
      listByDay: async () => observations,
      latest: async () => observations,
    },
  } as unknown as HealthRepositories
  return { repositories, rows: { meals, observations } }
}

describe('deciding what belongs in an account', () => {
  it('tells generated ids from seeded ones', () => {
    expect(isGeneratedId(crypto.randomUUID())).toBe(true)
    expect(isGeneratedId('meal-breakfast')).toBe(false)
    expect(isGeneratedId('obs-hrv')).toBe(false)
    expect(isGeneratedId('meal-lunch-v1')).toBe(false)
  })

  it('finds nothing in a fresh install that only has the sample day', async () => {
    const local = await localStore()
    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    // The demo day is present but must never reach the account (Q5).
    expect(found.meals).toEqual([])
    expect(found.observations).toEqual([])
  })

  it('finds a meal logged just after local midnight', async () => {
    // The bug this pins: the lookback range was built from toISOString(),
    // which is UTC. East of Greenwich, between midnight and the offset, the
    // local day is a day AHEAD of UTC — so "today" fell outside the window and
    // the most recent day was silently left behind on sign-in.
    const local = await localStore()
    const justAfterMidnight = new Date()
    justAfterMidnight.setHours(0, 30, 0, 0)

    await local.meals.add(
      buildMeal(LOCAL_USER_ID, {
        slot: 'NIGHT',
        at: justAfterMidnight,
        items: [{ name: 'Midnight toast', amount: 60, energyKcal: 150, proteinG: 4, carbsG: 28, fatG: 2 }],
      }),
    )

    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    expect(found.meals.map((m) => m.items[0].name)).toContain('Midnight toast')
  })

  it('finds meals the user actually logged', async () => {
    const local = await localStore()
    await local.meals.add(
      buildMeal(LOCAL_USER_ID, {
        slot: 'LUNCH',
        at: new Date(),
        items: [{ name: 'Real food', amount: 200, energyKcal: 300, proteinG: 20, carbsG: 30, fatG: 10 }],
      }),
    )

    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    expect(found.meals).toHaveLength(1)
    expect(found.meals[0].items[0].name).toBe('Real food')
  })

  it('leaves corrections to sample meals behind with the sample', async () => {
    const local = await localStore()
    const [seeded] = (await local.meals.listByDay(LOCAL_USER_ID, today())).filter(
      (meal) => meal.id === 'meal-lunch',
    )
    // Confirming an estimate on the demo day makes a version with a generated
    // RECORD id — but it still belongs to a seeded meal, and lifting it alone
    // would put a version 2 in the account with no version 1 beneath it.
    await local.meals.add(nextVersion(seeded, { slot: 'DINNER' }, newId))

    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    expect(found.meals).toEqual([])
  })

  it('finds observations the user confirmed, not the seeded readings', async () => {
    const local = await localStore()
    const confirmed: Observation = {
      id: newId() as Observation['id'],
      userId: LOCAL_USER_ID,
      code: 'WEIGHT',
      time: { kind: 'instant', at: new Date().toISOString(), zone: ZONE },
      value: canonical(72.8, 'kg'),
      provenance: deviceReading('SMART_SCALE', new Date().toISOString()),
    }
    await local.observations.add(confirmed)

    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    expect(found.observations.map((o) => o.id)).toEqual([confirmed.id])
  })
})

describe('moving records into the account', () => {
  it('rewrites ownership to the signed-in user', async () => {
    const local = await localStore()
    await local.meals.add(
      buildMeal(LOCAL_USER_ID, {
        slot: 'LUNCH',
        at: new Date(),
        items: [{ name: 'Mine', amount: 100, energyKcal: 200, proteinG: 10, carbsG: 20, fatG: 5 }],
      }),
    )

    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    const remote = remoteStore()
    const result = await adoptInto(remote.repositories, found, ACCOUNT)

    expect(result.meals).toBe(1)
    expect((remote.rows.meals[0] as { userId: string }).userId).toBe(ACCOUNT)
  })

  it('can be run twice without duplicating anything', async () => {
    const local = await localStore()
    await local.meals.add(
      buildMeal(LOCAL_USER_ID, {
        slot: 'LUNCH',
        at: new Date(),
        items: [{ name: 'Mine', amount: 100, energyKcal: 200, proteinG: 10, carbsG: 20, fatG: 5 }],
      }),
    )
    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    const remote = remoteStore()

    const first = await adoptInto(remote.repositories, found, ACCOUNT)
    const second = await adoptInto(remote.repositories, found, ACCOUNT)

    expect(first.meals).toBe(1)
    // An interrupted adoption must be safe to re-run: the second pass adds
    // nothing and reports what was already there.
    expect(second.meals).toBe(0)
    expect(second.skipped).toBe(1)
    expect(remote.rows.meals).toHaveLength(1)
  })

  it('uploads meal versions oldest first, so history arrives in order', async () => {
    const local = await localStore()
    const v1 = buildMeal(LOCAL_USER_ID, {
      slot: 'LUNCH',
      at: new Date(),
      items: [{ name: 'Mine', amount: 100, energyKcal: 200, proteinG: 10, carbsG: 20, fatG: 5 }],
    })
    await local.meals.add(v1)
    await local.meals.add(nextVersion(v1, { slot: 'DINNER' }, newId))

    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    const remote = remoteStore()
    await adoptInto(remote.repositories, found, ACCOUNT)

    expect((remote.rows.meals as { version: number }[]).map((m) => m.version)).toEqual([1, 2])
  })

  it('leaves the local copies alone', async () => {
    const local = await localStore()
    await local.meals.add(
      buildMeal(LOCAL_USER_ID, {
        slot: 'LUNCH',
        at: new Date(),
        items: [{ name: 'Mine', amount: 100, energyKcal: 200, proteinG: 10, carbsG: 20, fatG: 5 }],
      }),
    )
    const found = await findAdoptableRecords(local, LOCAL_USER_ID)
    await adoptInto(remoteStore().repositories, found, ACCOUNT)

    // Adoption copies; it does not move. Signing out must not lose anything.
    const stillLocal = await local.meals.listByDay(LOCAL_USER_ID, today())
    expect(stillLocal.some((meal) => meal.items[0]?.name === 'Mine')).toBe(true)
  })
})
