/**
 * The repository contract.
 *
 * One suite, run against every adapter. This is what turns D3 from a claim
 * into a fact: if IndexedDB and Supabase both satisfy these assertions, then
 * swapping them genuinely cannot change what a screen sees — and where they
 * differ (day filtering, candidate ordering, the D15 unique constraint), it
 * shows up here rather than in the UI.
 *
 * Deliberately behavioural: nothing here knows about stores, tables, keys or
 * SQL. It asks the questions a screen asks.
 */
import { describe, expect, it } from 'vitest'
import type { HealthRepositories } from '@/data/repositories'
import type { CalendarDate } from '@/domain'
import {
  canonical,
  deviceReading,
  detectMealConflicts,
  latestVersions,
  nextVersion,
  resolveEffective,
  userEntered,
  type AIInference,
  type Meal,
  type MealId,
  type Observation,
  type ObservationId,
  type UserId,
} from '@/domain'

export interface ContractContext {
  repositories: HealthRepositories
  userId: UserId
  /** Unique per run, so a shared remote database does not collide with itself. */
  prefix: string
}

/**
 * Days are handed out per test rather than hardcoded.
 *
 * The local store is wiped between tests; a remote one cannot be, because the
 * schema is append-only by design (D4). So isolation has to come from the data:
 * each test gets its own stretch of the calendar, and rows written by earlier
 * tests are simply on other days. Anything else passes locally and fails
 * remotely — which is exactly what happened the first time this ran.
 */
const DAY_BLOCK = 10

/**
 * Runs must not collide either, and must not merely differ — they must
 * ADVANCE.
 *
 * Rows from previous runs are still there; nothing can delete them. A random
 * stretch per run avoids overlap, but `latest()` asks a global question ("the
 * newest day this user has"), so a previous run that happened to land later in
 * the calendar wins and the assertion fails intermittently. Deriving the
 * stretch from wall-clock minutes makes each run land after the last, which is
 * the property that question actually needs.
 */
const RUN_STARTED = Date.now()
/** Epoch in the PAST, so the counter is positive and grows. */
const CLOCK_EPOCH = Date.UTC(2020, 0, 1)
/**
 * Wide enough that consecutive runs cannot overlap: a run occupies about
 * `tests × DAY_BLOCK` days, so one second of elapsed time must be worth more
 * than that. Minute granularity was not — two runs in the same minute shared a
 * stretch and the second failed.
 */
const RUN_STRIDE = 128
const runOffset = (): number => {
  const seconds = Math.floor((RUN_STARTED - CLOCK_EPOCH) / 1_000)
  return (seconds % 20_000) * RUN_STRIDE
}

const contractDay = (test: number, offset = 0): CalendarDate => {
  const base = new Date(Date.UTC(2030, 0, 1))
  base.setUTCDate(base.getUTCDate() + runOffset() + test * DAY_BLOCK + offset)
  return base.toISOString().slice(0, 10) as CalendarDate
}

const ZONE = 'Asia/Jerusalem'

export function runRepositoryContract(
  name: string,
  setup: () => Promise<ContractContext>,
): void {
  describe(`repository contract: ${name}`, () => {
    let testIndex = 0
    /** A fresh, unused stretch of calendar for each test. */
    const begin = async () => {
      const ctx = await setup()
      const index = testIndex++
      return { ctx, day: (offset = 0) => contractDay(index, offset) }
    }

    const mealFor = (ctx: ContractContext, day: string, suffix: string, version = 1): Meal => ({
      id: `${ctx.prefix}-${suffix}` as MealId,
      recordId: `${ctx.prefix}-${suffix}-v${version}`,
      version,
      userId: ctx.userId,
      slot: 'LUNCH',
      time: { kind: 'instant', at: `${day}T10:00:00.000Z`, zone: ZONE },
      items: [
        {
          id: `${ctx.prefix}-${suffix}-item` as Meal['items'][number]['id'],
          mealId: `${ctx.prefix}-${suffix}` as MealId,
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
    })

    const observationFor = (
      ctx: ContractContext,
      day: string,
      suffix: string,
      value: number,
      source: 'SMART_SCALE' | 'APPLE_HEALTH' = 'SMART_SCALE',
    ): Observation => ({
      id: `${ctx.prefix}-${suffix}` as ObservationId,
      userId: ctx.userId,
      code: 'WEIGHT',
      time: { kind: 'instant', at: `${day}T05:00:00.000Z`, zone: ZONE },
      value: canonical(value, 'kg'),
      provenance: deviceReading(source, `${day}T05:00:00.000Z`),
    })

    it('round-trips a meal unchanged', async () => {
      const { ctx, day } = await begin()
      const meal = mealFor(ctx, day(), 'roundtrip')
      await ctx.repositories.meals.add(meal)

      const [stored] = await ctx.repositories.meals.listByDay(ctx.userId, day())
      expect(stored.id).toBe(meal.id)
      expect(stored.version).toBe(1)
      expect(stored.items[0].name).toBe('Rice')
      // Canonical units survive the trip in both directions.
      expect(stored.items[0].nutrients.protein.value).toBe(5)
      expect(stored.time.kind).toBe('instant')
    })

    it('files records by their local day, and keeps days apart', async () => {
      const { ctx, day } = await begin()
      await ctx.repositories.meals.add(mealFor(ctx, day(0), 'day-a'))
      await ctx.repositories.meals.add(mealFor(ctx, day(1), 'day-b'))

      const first = await ctx.repositories.meals.listByDay(ctx.userId, day(0))
      const second = await ctx.repositories.meals.listByDay(ctx.userId, day(1))
      expect(first.map((m) => m.id)).toEqual([`${ctx.prefix}-day-a`])
      expect(second.map((m) => m.id)).toEqual([`${ctx.prefix}-day-b`])
    })

    it('reads a range inclusively at both ends', async () => {
      const { ctx, day } = await begin()
      await ctx.repositories.meals.add(mealFor(ctx, day(0), 'r1'))
      await ctx.repositories.meals.add(mealFor(ctx, day(1), 'r2'))
      await ctx.repositories.meals.add(mealFor(ctx, day(2), 'r3'))

      const range = await ctx.repositories.meals.listByRange(ctx.userId, {
        from: day(0),
        to: day(2),
      })
      expect(range).toHaveLength(3)
    })

    it('keeps every version of a meal, and the domain picks the newest (D15)', async () => {
      const { ctx, day } = await begin()
      const v1 = mealFor(ctx, day(), 'versioned')
      await ctx.repositories.meals.add(v1)
      await ctx.repositories.meals.add(
        nextVersion(v1, { slot: 'DINNER' }, () => `${ctx.prefix}-versioned-v2`),
      )

      const stored = await ctx.repositories.meals.listByDay(ctx.userId, day())
      expect(stored).toHaveLength(2)
      const latest = latestVersions(stored)
      expect(latest).toHaveLength(1)
      expect(latest[0].slot).toBe('DINNER')
    })

    it('returns every candidate observation, leaving precedence to the caller (D5)', async () => {
      const { ctx, day } = await begin()
      await ctx.repositories.observations.add(
        observationFor(ctx, day(), 'scale', 72.8, 'SMART_SCALE'),
      )
      await ctx.repositories.observations.add(
        observationFor(ctx, day(), 'phone', 73.7, 'APPLE_HEALTH'),
      )

      const candidates = await ctx.repositories.observations.listByDay(
        ctx.userId,
        day(),
        'WEIGHT',
      )
      expect(candidates).toHaveLength(2)
      // The store must not pre-resolve: that is the domain's job, and both
      // adapters must leave the same decision to it.
      const effective = resolveEffective(candidates)
      expect(effective?.provenance.source).toBe('SMART_SCALE')
    })

    it('filters observations by code', async () => {
      const { ctx, day } = await begin()
      await ctx.repositories.observations.add(observationFor(ctx, day(), 'w', 72.8))
      const weight = await ctx.repositories.observations.listByDay(ctx.userId, day(), 'WEIGHT')
      const hrv = await ctx.repositories.observations.listByDay(ctx.userId, day(), 'HRV')
      expect(weight).toHaveLength(1)
      expect(hrv).toHaveLength(0)
    })

    it('latest() returns all candidates from the most recent day only', async () => {
      const { ctx, day } = await begin()
      await ctx.repositories.observations.add(observationFor(ctx, day(0), 'old', 74))
      await ctx.repositories.observations.add(
        observationFor(ctx, day(1), 'new-a', 72.8, 'SMART_SCALE'),
      )
      await ctx.repositories.observations.add(
        observationFor(ctx, day(1), 'new-b', 73.7, 'APPLE_HEALTH'),
      )

      const latest = await ctx.repositories.observations.latest(ctx.userId, 'WEIGHT')
      // Remote stores keep earlier tests' rows, so assert about THIS test's
      // days rather than about the store as a whole.
      const mine = latest.filter((o) => o.id.startsWith(`${ctx.prefix}-`))
      expect(mine).toHaveLength(2)
      expect(
        mine.every((o) => o.time.kind === 'instant' && o.time.at.startsWith(day(1))),
      ).toBe(true)
    })

    it('returns nothing for a day with nothing, rather than failing', async () => {
      const { ctx, day } = await begin()
      const empty = day(5)
      expect(await ctx.repositories.meals.listByDay(ctx.userId, empty)).toEqual([])
      expect(await ctx.repositories.observations.listByDay(ctx.userId, empty)).toEqual([])
      expect(await ctx.repositories.sleep.forDay(ctx.userId, empty)).toEqual([])
    })

    it('records an AI inference and reads it back by id', async () => {
      const { ctx, day } = await begin()
      const inference: AIInference = {
        id: `${ctx.prefix}-inference` as AIInference['id'],
        userId: ctx.userId,
        purpose: 'FOOD_PHOTO_ESTIMATE' as const,
        model: 'test-model',
        modelVersion: 'test-model',
        createdAt: `${day()}T10:00:00.000Z`,
        confidence: 0.7,
        inputReferences: ['photo:abc'],
        output: { assumptions: ['assumed cooked weight'] },
        userConfirmed: false,
        safetyFlags: [],
      }
      await ctx.repositories.inferences.add(inference)

      const found = await ctx.repositories.inferences.get(inference.id)
      expect(found?.model).toBe('test-model')
      // The audit payload must survive intact — it is the "why did it think
      // that" record.
      expect((found?.output as { assumptions: string[] }).assumptions[0]).toContain('cooked')
    })

    it('surfaces a same-version write as a conflict, not silent success (D15)', async () => {
      const { ctx, day } = await begin()
      const v1 = mealFor(ctx, day(), 'clash')
      await ctx.repositories.meals.add(v1)

      const phone = nextVersion(v1, { slot: 'DINNER' }, () => `${ctx.prefix}-clash-phone`)
      const laptop = nextVersion(v1, { slot: 'SNACK' }, () => `${ctx.prefix}-clash-laptop`)
      await ctx.repositories.meals.add(phone)

      // The second device writing the same version either fails loudly
      // (Postgres unique constraint) or lands beside it (local store, which
      // has no second writer). Both are acceptable; silently replacing the
      // first is not.
      let rejected = false
      try {
        await ctx.repositories.meals.add(laptop)
      } catch {
        rejected = true
      }

      const stored = await ctx.repositories.meals.listByDay(ctx.userId, day())
      if (rejected) {
        expect(stored).toHaveLength(2)
      } else {
        expect(stored).toHaveLength(3)
        expect(detectMealConflicts(stored)).toHaveLength(1)
      }
    })
  })
}
