import { expect, test, type Page } from '@playwright/test'
import { open, switchToHebrew } from './app'
import { day, dayKeyBack, label, PERIOD, scenario, weekOf, type Scenario } from './suggestScenario'

/**
 * What to eat now, every way a day and a week can stand
 * (docs/features/meal-suggestions.md).
 *
 * Each test writes its own week into the browser's store, replacing the
 * sample's meals and burns, so every number on the card is known:
 *
 *   targets  2,150 kcal · protein 145 g · fat 70 g · carbs 235 g
 *            (the sample person; his burn is estimated once the watch's
 *            readings are cleared, so every day's budget is its target)
 *   today    the pinned Wednesday; Sunday to Tuesday are the week before it
 *
 * The plans, as `suggestPlan` decides them:
 *
 *   today has room (after the usual meals still to come) .... FILL
 *   the meals to come take what is left ..................... WAIT
 *   today used or over, protein reached ..................... nothing
 *   today used or over, protein short, the period against its plan range
 *   (± max(150, 3% of its budget); four days of 2,150 is ±258):
 *     below it .............................................. a protein snack, ≤ 250 and ≤ the room
 *     within it ............................................. only the optional light snack, ≤ 120
 *     above it .............................................. better to stop, and the light snack
 *   the week's protein ahead is said, and hides nothing.
 */

const section = (page: Page) => page.getByTestId('suggest-meals')
const line = (page: Page) => section(page).getByTestId('suggest-line')
const stop = (page: Page) => section(page).getByTestId('suggest-stop')
const suggestions = (page: Page) => page.getByTestId('suggestion')
const weekRow = (page: Page, name: string) =>
  section(page).getByTestId('suggest-week').locator('dt', { hasText: name }).locator('+ dd')
/** Where the period stands against its plan: "+89 · within plan range (±325)". */
const range = (page: Page) => section(page).getByTestId('suggest-range')
const light = (page: Page) => section(page).getByRole('button', { name: 'Hungry? Suggest a light protein snack' })

/** Every suggestion's calories, as shown. */
async function suggestedKcal(page: Page): Promise<number[]> {
  const texts = await suggestions(page).getByText(/^[\d,]+ kcal · /).allInnerTexts()
  return texts.map((text) => Number(text.split(' kcal')[0].replace(/[^\d]/g, '')))
}

test.describe('today has room: fill it', () => {
  test('lacking a lot: the whole room, the week as it stands, and suggestions within it', async ({ page }) => {
    await scenario(page, { today: [{ kcal: 400, protein: 25, slot: 'BREAKFAST' }], days: weekOf(day()) })
    await expect(line(page)).toHaveText('Left today: 1,750 kcal · 120 g protein')
    // The week: three days on target, and today so far.
    await expect(range(page)).toHaveText('−1,750 · below plan range (±258)')
    await expect(weekRow(page, 'Protein')).toHaveText('120 g behind')
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    // Up to what is left plus 10%.
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(1925)
  })

  test('a little room, 100 kcal or more: still filled', async ({ page }) => {
    await scenario(page, { today: day(2030, 140), days: weekOf(day()) })
    await expect(line(page)).toHaveText('Left today: 120 kcal · 5 g protein')
    await expect(section(page).getByRole('button', { name: 'Suggest what to eat' })).toBeVisible()
  })

  test('on a Sunday the last seven days still count; with only today logged, today alone decides', async ({ page }) => {
    await scenario(page, { shiftDays: -3, today: [{ kcal: 900, protein: 50 }] })
    await expect(line(page)).toHaveText('Left today: 1,250 kcal · 95 g protein')
    await expect(section(page).getByTestId('suggest-period')).toHaveText(`${label(9)} – ${label(3)} · 1 of 7 days counted`)
    await expect(section(page).getByTestId('suggest-sparse')).toBeVisible()
  })
})

test.describe('today reached its calories, or went over', () => {
  test('at the target with the protein reached: nothing to suggest', async ({ page }) => {
    await scenario(page, { today: day(2150, 145), days: weekOf(day(1800, 120)) })
    await expect(page.getByTestId('targets-status')).toHaveText('On target')
    await expect(section(page)).toHaveCount(0)
  })

  test('over with the protein reached: nothing either, whatever the week', async ({ page }) => {
    await scenario(page, { today: day(2476, 150), days: weekOf(day(1600, 100)) })
    await expect(page.getByTestId('targets-status')).toHaveText('326 over')
    await expect(section(page)).toHaveCount(0)
  })

  test('at the limit, protein short, the week under and behind on protein: a protein snack', async ({ page }) => {
    // 30 kcal left, 25 g short; the week 750 under, today included 780.
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)) })
    await expect(line(page)).toHaveText('Left today: 30 kcal · 25 g protein')
    await expect(range(page)).toHaveText('−780 · below plan range (±258)')
    await expect(weekRow(page, 'Protein')).toHaveText('70 g behind')
    await expect(section(page).getByTestId('suggest-hint')).toHaveText('A light protein snack still fits.')
    await section(page).getByRole('button', { name: 'Suggest a protein snack' }).click()
    await expect(section(page).getByRole('heading', { name: /up to 250 kcal/ })).toBeVisible({ timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(250)
  })

  test('at the limit, protein short, but the week above plan range: better to stop, the light snack optional', async ({ page }) => {
    await scenario(page, { today: day(2120, 120), days: weekOf(day(2400, 130)) })
    await expect(range(page)).toHaveText('+720 · above plan range (±258)')
    await expect(stop(page)).toContainText('Better to stop for today.')
    await expect(stop(page)).toContainText(`${PERIOD} is 720 kcal above plan.`)
    await expect(section(page).getByRole('button', { name: /^Suggest/ })).toHaveCount(0)
    await expect(light(page)).toBeVisible()
    await expect(section(page).getByTestId('suggest-projection')).toHaveText(
      `Up to 120 kcal: ${PERIOD} would be at most +840, still above plan range.`,
    )
  })

  test('over today, protein short, the week with plenty of room: a protein snack of at most 250', async ({ page }) => {
    // 326 over, 11 g short; the week 750 under before today, 424 with it.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(1900, 130)) })
    await expect(line(page)).toHaveText(`${label(0)} · 326 kcal above target · protein 11 g short`)
    await expect(range(page)).toHaveText('−424 · below plan range (±258)')
    await section(page).getByRole('button', { name: 'Suggest a protein snack' }).click()
    await expect(section(page).getByRole('heading', { name: /up to 250 kcal/ })).toBeVisible({ timeout: 15_000 })
    // What each adds today, and where the week lands.
    await expect(suggestions(page).first().getByTestId('suggestion-fit')).toHaveText(
      /^\+[\d,]+ kcal today · protein \d+ of 145 g( ✓)? · 4 days −[\d,]+, (below|within) plan range$/,
    )
  })

  test('over today, the week 124 under: within plan range, so only the optional light snack', async ({ page }) => {
    // The week 450 under before today; 326 over today leaves 124, inside ±258.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2000, 130)) })
    await expect(range(page)).toHaveText('−124 · within plan range (±258)')
    await expect(section(page).getByTestId('suggest-status')).toHaveText(
      `Today is 326 kcal above target; ${PERIOD} is within plan range.`,
    )
    await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toHaveCount(0)
    await expect(section(page).getByTestId('suggest-projection')).toHaveText(
      `Up to 120 kcal: ${PERIOD} would be at most −4, still within plan range.`,
    )
    await light(page).click()
    await expect(section(page).getByRole('heading', { name: 'A light protein snack: up to 120 kcal' })).toBeVisible({ timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(120)
  })

  test('over today and above plan range for the week: better to stop, and the light snack on request', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2300, 130)) })
    await expect(range(page)).toHaveText('+776 · above plan range (±258)')
    await expect(stop(page)).toContainText('Better to stop for today.')
    await expect(stop(page)).toContainText(`${PERIOD} is 776 kcal above plan.`)
    await light(page).click()
    await expect(section(page).getByRole('heading', { name: /up to 120 kcal/ })).toBeVisible({ timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(120)
  })

  test('the week’s protein ahead is said, and the light snack is still offered', async ({ page }) => {
    // The week 75 g ahead on protein before today.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2000, 170)) })
    await expect(weekRow(page, 'Protein')).toHaveText('64 g ahead')
    await expect(section(page).getByTestId('suggest-protein-ahead')).toHaveText(
      'Protein over the last 7 days is 75 g ahead, so today’s 11 g can also wait.',
    )
    await expect(light(page)).toBeVisible()
  })

  test('the week over on fat: the snack is a lean one', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(1900, 130, 90)) })
    await expect(weekRow(page, 'Fat')).toHaveText(/^\d+ g over$/)
    await expect(section(page).getByTestId('suggest-hint')).toHaveText(
      'The last 7 days are behind on protein and over on fat: a lean protein snack makes sense.',
    )
  })

  test('what a watch recorded counts: a week over its targets has room after big burns', async ({ page }) => {
    // Each day 2,400 against a 2,150 target would leave no room; but each
    // burned 3,200 (a budget of 2,850), so the week is 1,350 under, 1,024 with today.
    await scenario(page, {
      today: day(2476, 134),
      days: weekOf(day(2400, 130)),
      burns: { 1: 3200, 2: 3200, 3: 3200 },
    })
    await expect(range(page)).toHaveText('−1,024 · below plan range (±321)')
    await expect(section(page).getByTestId('suggest-week')).toContainText('Days with a recorded burn count what you really burned.')
    await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toBeVisible()
  })

  test('a watch that stopped counting is not believed', async ({ page }) => {
    // 1,000 burned is a flat battery against a usual 2,500: the day is weighed against its target.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2300, 130)), burns: { 1: 1000 } })
    await expect(range(page)).toHaveText('+776 · above plan range (±258)')
    await expect(stop(page)).toBeVisible()
  })
})

test.describe('the usual meals still to come', () => {
  /** Ten days of lunch at 13:00 (600) and dinner at 20:00 (650). */
  const usual = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      i + 1,
      [
        { kcal: 600, protein: 45, slot: 'LUNCH' as const, time: '13:00' },
        { kcal: 650, protein: 45, slot: 'DINNER' as const, time: '20:00' },
      ],
    ]),
  )

  test('at 16:30, dinner’s room is kept, and what is suggested is a snack', async ({ page }) => {
    // 1,250 eaten, 900 left; dinner usually 650: 250 now, up to 275.
    await scenario(page, {
      at: '16:30',
      today: [
        { kcal: 650, protein: 40, slot: 'BREAKFAST', time: '08:00' },
        { kcal: 600, protein: 45, slot: 'LUNCH', time: '13:00' },
      ],
      days: usual,
    })
    await expect(section(page).getByTestId('suggest-to-come')).toHaveText(
      'Your usual dinner is still to come, about 650 kcal, so this leaves room for it: up to 275 kcal now.',
    )
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(275)
    // Logged as a snack, so dinner is still to come (and its reminder still comes).
    await suggestions(page).first().getByRole('button', { name: /^Log it: / }).click()
    await expect(section(page).getByRole('status')).toContainText('Logged as snack:')
  })

  test('when dinner takes what is left: better to wait for it', async ({ page }) => {
    await scenario(page, {
      at: '16:30',
      today: [
        { kcal: 950, protein: 60, slot: 'BREAKFAST', time: '08:00' },
        { kcal: 600, protein: 45, slot: 'LUNCH', time: '13:00' },
      ],
      days: usual,
    })
    await expect(stop(page)).toContainText('Better to wait for dinner.')
    await expect(stop(page)).toContainText('It usually comes to about 650 kcal, about what is left today.')
    await expect(light(page)).toBeVisible()
  })

  test('close to dinner’s usual time, dinner is now: the whole room is offered', async ({ page }) => {
    await scenario(page, {
      at: '19:40',
      today: [{ kcal: 600, protein: 45, slot: 'LUNCH', time: '13:00' }],
      days: usual,
    })
    await expect(line(page)).toHaveText('Left today: 1,550 kcal · 100 g protein')
    await expect(section(page).getByTestId('suggest-to-come')).toHaveCount(0)
  })
})

test.describe('today’s training', () => {
  test('after the sample’s strength session, the card says protein first', async ({ page }) => {
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)) })
    await expect(section(page).getByTestId('suggest-training')).toHaveText(
      '62 min of strength training today: protein first, and some carbs are fine.',
    )
  })

  test('on a rest day it says nothing about training', async ({ page }) => {
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)), restDay: true })
    await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toBeVisible()
    await expect(section(page).getByTestId('suggest-training')).toHaveCount(0)
  })
})

test.describe('in Hebrew', () => {
  test('the week, the protein ahead and the light snack read right', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2000, 170)) })
    await switchToHebrew(page)
    await open(page, '/today')
    await expect(weekRow(page, 'חלבון')).toHaveText('64 גרם מעל')
    await expect(section(page).getByTestId('suggest-protein-ahead')).toHaveText(
      'החלבון ב־7 הימים האחרונים 75 גרם מעל היעד, אז גם ה־11 גרם של היום יכולים לחכות.',
    )
    await expect(section(page).getByRole('button', { name: 'רעבים? הצעה לנשנוש חלבון קל' })).toBeVisible()
  })

  test('above plan range: the stop, with dates', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2300, 130)) })
    await switchToHebrew(page)
    await open(page, '/today')
    await expect(line(page)).toHaveText(`${label(0, 'he')} · 326 קלוריות מעל היעד · חסרים 11 גרם חלבון`)
    // The signed number isolated left to right, so its sign stays in front.
    await expect(range(page)).toHaveText('\u2066+776\u2069 · מעל טווח התוכנית (±258)')
    await expect(stop(page)).toContainText('עדיף לעצור להיום.')
  })
})

test.describe('Phase 1 acceptance: the owner’s Thursday, replayed', () => {
  /*
    Thursday, the day after the pinned Wednesday. The watch recorded 28 days
    averaging 2,410 before it, so Thursday's target is 2,410 − 350 = 2,060
    ("Lose weight" with "Lower body fat" is lose fat, keep muscle: 350 under).
    Sunday to Wednesday burned 10,170 and ate 8,533; Thursday ate 2,386 with
    protein 134 of 145. The period: +89 against a budget of 10,830, ±325.
  */
  const burnedSunToWed = [2500, 2550, 2560, 2560] // 4, 3, 2, 1 days back from Thursday
  const eatenSunToWed = [2100, 2150, 2140, 2143]
  const thursday = (proteinSunToWed = 120): Scenario => {
    const burns: Record<number, number> = {}
    for (let back = 1; back <= 28; back++) burns[back] = back <= 4 ? burnedSunToWed[4 - back] : back <= 26 ? 2388 : 2387
    return {
      shiftDays: 1,
      at: '20:40',
      today: [{ kcal: 2386, protein: 134 }],
      days: Object.fromEntries(eatenSunToWed.map((kcal, i) => [4 - i, [{ kcal, protein: proteinSunToWed }]])),
      burns,
      restDay: true,
    }
  }
  const thu = () => label(-1)
  /** The card's period on Thursday: the last seven days, Friday to Thursday. */
  const sunToThu = () => `${label(5)} – ${label(-1)}`
  /** A 120 kcal snack, and one of 121: past the stated cap, which the validator must drop. */
  const scripted = {
    suggestions: [
      {
        title: 'Cottage cheese 1%',
        source: 'USUAL',
        why: 'The most protein for 120 kcal.',
        foods: [{ name: 'Cottage cheese 1%', amountG: 150, energyKcal: 120, proteinG: 17, carbsG: 5, fatG: 3.3 }],
      },
      {
        title: 'A little more cottage',
        source: 'FOODS',
        why: 'One gram over.',
        foods: [{ name: 'Cottage cheese 1%', amountG: 151, energyKcal: 121, proteinG: 17, carbsG: 5, fatG: 3.4 }],
      },
    ],
    note: '',
  }

  test('the card, the validator, logging and Undo: +89 → +209 → +89', async ({ page }) => {
    await scenario(page, thursday())
    await expect(page.getByTestId('targets-card').getByText('of 2,060 kcal')).toBeVisible()

    // The card: dates, days counted, within plan range.
    await expect(line(page)).toHaveText(`${thu()} · 326 kcal above target · protein 11 g short`)
    await expect(section(page).getByTestId('suggest-period')).toHaveText(`${sunToThu()} · 5 of 7 days counted`)
    await expect(range(page)).toHaveText('+89 · within plan range (±325)')
    await expect(section(page).getByTestId('suggest-status')).toHaveText(
      `Today is 326 kcal above target; ${sunToThu()} is within plan range.`,
    )

    // Why two numbers: 1,637 below expenditure, 1,400 planned, 237 below target, 326 above today.
    await section(page).getByTestId('suggest-why').getByText('Why two numbers?').click()
    const why = section(page).getByTestId('suggest-why')
    await expect(why).toContainText(`${label(3)} – ${label(0)}: 8,533 eaten against 10,170 estimated expenditure (−1,637).`)
    await expect(why).toContainText(
      'Your plan for those days was 1,400 under what you burned, 350 a day for “Lose fat, keep muscle”, so against target: −237.',
    )
    await expect(why).toContainText(`${thu()}: 2,386 eaten against a 2,060 target (+326).`)
    await expect(why).toContainText(`${sunToThu()}: +89 against your plan.`)

    // The optional light snack, and what it would do.
    await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toHaveCount(0)
    await expect(section(page).getByTestId('suggest-projection')).toHaveText(
      `Up to 120 kcal: ${sunToThu()} would be at most +209, still within plan range.`,
    )

    // The validator: 120 is shown, 121 is not.
    await page.evaluate((reply) => ((window as unknown as { __suggestReply: unknown }).__suggestReply = reply), scripted)
    await light(page).click()
    await expect(section(page).getByRole('heading', { name: 'A light protein snack: up to 120 kcal' })).toBeVisible({ timeout: 15_000 })
    await expect(suggestions(page)).toHaveCount(1)
    await expect(suggestions(page).first().getByText('Cottage cheese 1%').first()).toBeVisible()
    await expect(suggestions(page).first().getByTestId('suggestion-fit')).toHaveText(
      '+120 kcal today · protein 151 of 145 g ✓ · 5 days +209, within plan range',
    )

    // Logging moves the period to +209; Undo brings it back to +89.
    await suggestions(page).first().getByRole('button', { name: 'Log it: Cottage cheese 1%' }).click()
    await expect(section(page).getByRole('status')).toContainText('Cottage cheese 1%')
    await expect(range(page)).toHaveText('+209 · within plan range (±325)')
    await section(page).getByRole('button', { name: 'Undo' }).click()
    await expect(section(page).getByText('Taken back.')).toBeVisible()
    await expect(range(page)).toHaveText('+89 · within plan range (±325)')
  })

  test('with the week’s protein ahead, the light snack is still offered, the protein only explained', async ({ page }) => {
    // 175 g a day, Sunday to Wednesday: 30 over each, 120 ahead before today, 109 with it.
    await scenario(page, thursday(175))
    await expect(range(page)).toHaveText('+89 · within plan range (±325)')
    await expect(section(page).getByTestId('suggest-protein-ahead')).toHaveText(
      'Protein over the last 7 days is 120 g ahead, so today’s 11 g can also wait.',
    )
    await expect(light(page)).toBeVisible()
  })
})

test.describe('a day possibly incomplete', () => {
  /** Monday and Wednesday's day on target; Tuesday only 900 logged; today 326 over and 11 g short. */
  const week = (): Scenario => ({
    today: day(2476, 134),
    days: { 1: day(2150, 130), 2: day(900, 60), 3: day(2150, 130) },
  })

  test('is left out of the balance until answered, and shown with the question', async ({ page }) => {
    await scenario(page, week())
    await expect(section(page).getByTestId('suggest-period')).toHaveText(`${PERIOD} · 3 of 7 days counted`)
    const flag = section(page).getByTestId('suggest-flag')
    await expect(flag).toContainText(`${label(2)}: 900 kcal logged. Is that everything?`)
    await expect(flag).toContainText('Not counted until you answer.')
    // Without Tuesday: two days on target and today +326, against 6,450: ±194, above.
    await expect(range(page)).toHaveText('+326 · above plan range (±194)')
  })

  test('answered “all of it”, it counts; answered “some is missing”, it stays out, and can be taken back', async ({ page }) => {
    await scenario(page, week())
    await section(page).getByTestId('suggest-flag').getByRole('button', { name: 'Yes, all of it' }).click()
    await expect(section(page).getByTestId('suggest-period')).toHaveText(`${PERIOD} · 4 of 7 days counted`)
    // With Tuesday: −1,250 + 326 = −924 against 8,600: below plan range, so a protein snack.
    await expect(range(page)).toHaveText('−924 · below plan range (±258)')
    await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toBeVisible()

    // Changed in Nutrition: "No, some is missing".
    await open(page, `/nutrition?d=${dayKeyBack(2)}`)
    const question = page.getByTestId('day-completeness')
    await expect(question).toContainText('Marked as fully logged.', { timeout: 15_000 })
    await question.getByRole('button', { name: 'Change' }).click()
    await question.getByRole('button', { name: 'No, some is missing' }).click()
    await expect(question).toContainText('Marked as not fully logged: left out of the suggestions’ balance.')

    await open(page, '/today')
    await expect(section(page).getByTestId('suggest-marked')).toHaveText(`${label(2)}: marked as not fully logged, not counted. Undo`)
    await expect(section(page).getByTestId('suggest-period')).toHaveText(`${PERIOD} · 3 of 7 days counted`)
    await section(page).getByTestId('suggest-marked').getByRole('button', { name: 'Undo' }).click()
    await expect(section(page).getByTestId('suggest-flag')).toBeVisible()
  })

  test('the week view still shows every day, whatever the card counts', async ({ page }) => {
    // With burns recorded, so the week view has something to compare.
    await scenario(page, { ...week(), burns: { 1: 2500, 2: 2500, 3: 2500 } })
    await open(page, '/today?view=week')
    // Every day on the week's targets, Tuesday's 900 included.
    await expect(page.getByLabel(/: under, 900 of 2,150 kcal$/)).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('asking about today before suggesting', () => {
  /** Ten days of lunch at 13:00 (690) and dinner at 20:00 (650). */
  const habits = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      i + 1,
      [
        { kcal: 690, protein: 45, slot: 'LUNCH' as const, time: '13:00' },
        { kcal: 650, protein: 45, slot: 'DINNER' as const, time: '20:00' },
      ],
    ]),
  )

  test('no lunch logged by evening: asked first, and the usual lunch added in one tap', async ({ page }) => {
    await scenario(page, { at: '20:40', today: [{ kcal: 700, protein: 40, slot: 'BREAKFAST', time: '08:00' }], days: habits })
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    const question = section(page).getByTestId('suggest-question')
    await expect(question).toContainText('No lunch logged today. Did you eat it?')
    await question.getByRole('button', { name: 'Add my usual lunch · 690 kcal' }).click()
    await expect(section(page).getByText('Added your usual lunch. The card is up to date.')).toBeVisible()
    await expect(line(page)).toHaveText('Left today: 760 kcal · 60 g protein')
    // Asked again, nothing is missing now: straight to the suggestions.
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
  })

  test('“I skipped it” goes straight on, and is not asked again today', async ({ page }) => {
    await scenario(page, { at: '20:40', today: [{ kcal: 700, protein: 40, slot: 'BREAKFAST', time: '08:00' }], days: habits })
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await section(page).getByTestId('suggest-question').getByRole('button', { name: 'I skipped it' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    await section(page).getByRole('button', { name: 'Close' }).click()
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    await expect(section(page).getByTestId('suggest-question')).toHaveCount(0)
  })

  test('a day low for the hour, with no usual meal to blame: asked whether it is complete', async ({ page }) => {
    await scenario(page, { at: '20:40', today: [{ kcal: 800, protein: 40 }], days: weekOf(day()) })
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    const question = section(page).getByTestId('suggest-question')
    await expect(question).toContainText('Is today’s log complete? 800 of 2,150 kcal logged so far.')
    await question.getByRole('button', { name: 'No, some is missing' }).click()
    await expect(question).toContainText('Then the suggestions may be too generous.')
    await question.getByRole('button', { name: 'Continue anyway' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    await section(page).getByRole('button', { name: 'Close' }).click()
    await expect(section(page).getByTestId('suggest-today-incomplete')).toBeVisible()
  })

  test('answered “that’s everything”, it goes on and does not ask again', async ({ page }) => {
    await scenario(page, { at: '20:40', today: [{ kcal: 800, protein: 40 }], days: weekOf(day()) })
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await section(page).getByTestId('suggest-question').getByRole('button', { name: 'Yes, that’s everything' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    await section(page).getByRole('button', { name: 'Close' }).click()
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(section(page).getByTestId('suggest-question')).toHaveCount(0)
  })
})

test.describe('empty states: not enough logged yet', () => {
  test('with only today logged, the suggestions say they will be general ideas', async ({ page }) => {
    await scenario(page, { today: [{ kcal: 600, protein: 30, slot: 'BREAKFAST' }] })
    await expect(section(page).getByText(
      'Only a few days logged so far, so these will be general ideas until your own foods show up.',
    )).toBeVisible()
  })

  test('with too few counted days, today alone decides, and the card says so', async ({ page }) => {
    // Only Tuesday and today: 2 counted days.
    await scenario(page, { today: day(2476, 134), days: { 1: day(2150, 130) } })
    await expect(section(page).getByTestId('suggest-sparse')).toHaveText('Too few complete days in the last 7: today’s targets only.')
    await expect(section(page).getByTestId('suggest-period')).toHaveText(`${PERIOD} · 2 of 7 days counted`)
    // Today alone: 326 above its 2,150 target, against ±150.
    await expect(stop(page)).toContainText('Today is 326 kcal above target.')
    await expect(section(page).getByTestId('suggest-projection')).toHaveText(
      'Up to 120 kcal: today would be at most +446, still above plan range.',
    )
  })
})

test.describe('Phase 2: the last seven days, not the calendar week', () => {
  test('on a Sunday, Saturday’s overeating still counts', async ({ page }) => {
    // Sunday, 326 over and 11 g short. Monday to Friday on target; Saturday 3,000, 850 over.
    // The calendar week would hold Sunday alone; the last seven days hold all of it:
    // 850 + 326 = +1,176 against 7 × 2,150 = 15,050, ±452: above plan range.
    await scenario(page, {
      shiftDays: -3,
      today: day(2476, 134),
      days: { 1: day(3000, 140), 2: day(), 3: day(), 4: day(), 5: day(), 6: day() },
    })
    await expect(section(page).getByTestId('suggest-period')).toHaveText(`${label(9)} – ${label(3)} · 7 of 7 days counted`)
    await expect(range(page)).toHaveText('+1,176 · above plan range (±452)')
    await expect(stop(page)).toContainText('Better to stop for today.')
  })

  test('the week view keeps calendar weeks, for reporting', async ({ page }) => {
    await scenario(page, {
      shiftDays: -3,
      today: day(2476, 134),
      days: { 1: day(3000, 140), 2: day(), 3: day() },
      // Today's burn too, so the calendar week (today alone) has something to compare.
      burns: { 0: 2500, 1: 2500, 2: 2500, 3: 2500 },
    })
    await open(page, '/today?view=week')
    // Sunday starts the week shown: Saturday is last week's, not this one's.
    await expect(page.getByLabel(/: over, 2,476 of 2,150 kcal$/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel(/3,000 of 2,150 kcal$/)).toHaveCount(0)
  })
})

test.describe('Phase 3: today’s training, counted', () => {
  /** Ten earlier days of 400 active calories from the watch. */
  const usualActive = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 400]))

  test('380 kcal more active than usual: half of it, 190, is room today', async ({ page }) => {
    // 30 kcal left before the credit; 220 with it, so the day can be filled.
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)), active: { ...usualActive, 0: 780 } })
    await expect(section(page).getByTestId('suggest-credit')).toHaveText(
      '380 kcal more active than usual today: 190 of it counted towards today.',
    )
    await expect(line(page)).toHaveText('Left today: 220 kcal · 25 g protein')
    await expect(section(page).getByRole('button', { name: 'Suggest what to eat' })).toBeVisible()
    // The day's target itself stays as it is.
    await expect(page.getByTestId('targets-card').getByText('of 2,150 kcal')).toBeVisible()
  })

  test('a usual day earns nothing: the usual burn already holds it', async ({ page }) => {
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)), active: { ...usualActive, 0: 400 } })
    await expect(line(page)).toHaveText('Left today: 30 kcal · 25 g protein')
    await expect(section(page).getByTestId('suggest-credit')).toHaveCount(0)
  })
})

test.describe('Phase 4: better food choices', () => {
  test('a protein gap bigger than one sitting is said, with this person’s number', async ({ page }) => {
    // 72.8 kg: about 36 g a sitting at most; 105 g short.
    await scenario(page, { today: [{ kcal: 1000, protein: 40 }], days: weekOf(day()) })
    await expect(section(page).getByTestId('suggest-sitting')).toHaveText(
      'A 105 g protein gap is more than one sitting uses well (about 36 g for you): this closes what one can, and the rest is for your next meal.',
    )
  })

  test('fat low over the last seven days: some is welcome', async ({ page }) => {
    // 20 g a day for three days and 33 today: 23 a day, under 0.5 g per kg (36).
    await scenario(page, { today: [{ kcal: 1000, protein: 40 }], days: weekOf(day(2150, 145, 20)) })
    await expect(section(page).getByTestId('suggest-fat-low')).toHaveText(
      'Fat has been low over the last 7 days (23 g a day): some is welcome.',
    )
  })

  test('two hours before the usual bedtime: something light, at most 400 kcal', async ({ page }) => {
    const nights = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, '23:30']))
    await scenario(page, { at: '21:30', today: [{ kcal: 1200, protein: 60 }], days: weekOf(day()), sleepStarts: nights })
    await expect(section(page).getByTestId('suggest-bedtime')).toHaveText(
      'About 2 h before your usual bedtime (23:30): something light, at most 400 kcal.',
    )
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(400)
  })

  test('after an hour of endurance training, carbs are part of the answer', async ({ page }) => {
    await scenario(page, { today: [{ kcal: 1200, protein: 60 }], days: weekOf(day()), workouts: [{ kind: 'RUNNING', minutes: 75 }] })
    await expect(section(page).getByTestId('suggest-training')).toHaveText(
      '75 min of endurance training today: carbs are part of the answer, to refuel.',
    )
  })
})

test.describe('Phase 5: the real burn, learned from the weight', () => {
  test('with too little data, Settings says how far along it is', async ({ page }) => {
    await open(page, '/settings?tab=goals')
    await expect(page.getByTestId('burn-not-enough')).toHaveText(
      /^Learning your real burn from your weight needs 28 days of logging and weigh-ins: so far \d+ of 24 days logged fully, and \d of 6 weigh-ins\.$/,
      { timeout: 15_000 },
    )
  })

  test('offered, approved, used in the targets, and stopped', async ({ page }) => {
    // 28 days of 2,000 eaten at a steady 72.8 kg: a burn of 2,000, against the 2,500 estimated.
    const weighIns = Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => i + 1)
        .filter((back) => back % 4 === 1 || back === 28)
        .map((back) => [back, 72.8]),
    )
    await scenario(page, {
      today: day(1500, 100),
      days: Object.fromEntries(Array.from({ length: 28 }, (_, i) => [i + 1, day(2000, 140)])),
      weighIns,
    })
    await open(page, '/settings?tab=goals')
    const card = page.getByTestId('burn-from-weight')
    await expect(card.getByTestId('burn-offer')).toContainText(
      'Over the last 28 days, your weight trend says you burn about 2,000 kcal a day, not the 2,500 your targets use (20% less).',
      { timeout: 15_000 },
    )
    // Nothing changes until the person says so.
    await open(page, '/today')
    await expect(page.getByTestId('targets-card').getByText('of 2,150 kcal')).toBeVisible({ timeout: 15_000 })

    await open(page, '/settings?tab=goals')
    await card.getByRole('button', { name: 'Use 2,000 a day' }).click()
    await expect(card.getByTestId('burn-applied')).toContainText('Your targets use your weight trend: your burn × 0.80')
    // 2,498 × 0.80 = 1,999, less 350: 1,650.
    await open(page, '/today')
    await expect(page.getByTestId('targets-card').getByText('of 1,650 kcal')).toBeVisible({ timeout: 15_000 })

    await open(page, '/settings?tab=goals')
    await card.getByRole('button', { name: 'Stop using it' }).click()
    await expect(card.getByTestId('burn-applied')).toHaveCount(0)
    await open(page, '/today')
    await expect(page.getByTestId('targets-card').getByText('of 2,150 kcal')).toBeVisible({ timeout: 15_000 })
  })

  test('“Not now” is remembered', async ({ page }) => {
    const weighIns = Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => i + 1)
        .filter((back) => back % 4 === 1 || back === 28)
        .map((back) => [back, 72.8]),
    )
    await scenario(page, {
      today: day(1500, 100),
      days: Object.fromEntries(Array.from({ length: 28 }, (_, i) => [i + 1, day(2000, 140)])),
      weighIns,
    })
    await open(page, '/settings?tab=goals')
    const card = page.getByTestId('burn-from-weight')
    await card.getByRole('button', { name: 'Not now' }).click()
    await expect(card.getByTestId('burn-dismissed')).toBeVisible()
    await open(page, '/settings?tab=goals')
    await expect(card.getByTestId('burn-offer')).toHaveCount(0, { timeout: 15_000 })
    await expect(card.getByTestId('burn-dismissed')).toBeVisible()
  })
})
