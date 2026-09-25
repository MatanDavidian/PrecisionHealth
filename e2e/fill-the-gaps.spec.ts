import { expect, test } from '@playwright/test'
import { dayKey, open, storedRows, switchToHebrew } from './app'

/**
 * Filling a day nobody logged, from the days they did.
 *
 * The feature exists because a blank day reads as a zero, and a week graded
 * against a zero is graded against a fiction. Everything below is really a
 * test of one thing: that the number arrives AND that it never stops
 * announcing what it is.
 */

const gapsCard = (page: import('@playwright/test').Page) =>
  page.getByText(/have no meals on them|has no meals on it/)

test('the week names its blank days, and says why zero is wrong', async ({ page }) => {
  await open(page, '/today?view=week')

  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  // The sentence is the argument for the whole feature.
  await expect(page.getByText(/which is not the same as eating nothing/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Fill it from your average/ })).toBeVisible()
})

test('filling writes the day, and the week stops reading it as zero', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /Fill it from your average/ }).click()

  // The offer is replaced by its result rather than sitting beside it.
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
  await expect(gapsCard(page)).toBeHidden()

  // And the day now carries a figure, which is the point.
  await expect(page.locator('.estimated-fill').first()).toBeVisible()
})

test('a filled day never stops saying it is an estimate', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  /*
    The second of the two rules, and the one a refactor is most likely to
    quietly break: the tag lives in the record's provenance, so it has to
    survive a reload rather than living in the component that wrote it.
  */
  await open(page, '/today?view=week')
  await expect(page.locator('.estimated-fill').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Estimated')).toBeVisible()
})

test('undo takes the invented day back', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Undo', exact: true }).click()

  // Back to a gap, and offered again — the day really is empty once more.
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.estimated-fill')).toHaveCount(0)
})

test('a filled day is counted, but never fed back into the average', async ({ page }) => {
  /*
    The first rule. If a filled day were evidence, filling one gap would change
    what "typical" means for the next — and a week of skipping would rewrite
    the baseline out of guesses about guesses.

    Observable from outside: fill, undo, and the offer must return identical.
    A day that had fed the average would come back different.
  */
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  const before = await gapsCard(page).textContent()

  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()

  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  expect(await gapsCard(page).textContent()).toBe(before)
})

test('the week total moves by what was filled, not by a fiction', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  // The filled day is a real figure in the week's arithmetic — that is the
  // whole reason for filling it rather than leaving the gap.
  const bars = page.locator('.estimated-fill')
  await expect(bars.first()).toBeVisible()
  const height = await bars.first().evaluate((el) => (el as HTMLElement).offsetHeight)
  expect(height).toBeGreaterThan(10)
})

test('a filled day shows its totals, marked as estimated, and no meals', async ({ page }) => {
  /*
    A filled day is a claim about how much, not about what. The numbers go in
    the day's totals — that is what filling is for — and the meal list stays
    empty, because nobody logged anything. The note on the totals is what
    stops the number passing as observed.
  */
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  const yesterday = dayKey(-1)
  const checks: [string, string][] = [
    [`/today?d=${yesterday}`, 'Nothing was logged on this day.'],
    [`/nutrition?d=${yesterday}`, 'Nothing logged for this day yet.'],
  ]
  for (const [path, empty] of checks) {
    await open(page, path)
    await expect(page.getByText(/these are your average day/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(empty)).toBeVisible()
    // The totals carry the average — not zero.
    await expect(page.getByText(/^1,9\d\d$|^2,0\d\d$/).first()).toBeVisible()
    // None of the foods the average was drawn from, and no meal slots.
    for (const food of ['Eggs and oats', 'Grilled chicken', 'Salmon']) {
      await expect(page.getByText(new RegExp(food))).toHaveCount(0)
    }
    for (const slot of ['Breakfast', 'Lunch', 'Dinner']) {
      await expect(page.getByText(slot, { exact: true })).toHaveCount(0)
    }
  }
  // Nobody logged anything; the count must not say otherwise.
  await expect(page.getByText('Logged (0)')).toBeVisible()

  // And the estimate can still be taken away from where it is shown.
  await page.getByRole('button', { name: 'Remove the estimate' }).click()
  await expect(page.getByText(/these are your average day/)).toHaveCount(0)
})

/**
 * Removes every meal on the given days, straight from the store.
 *
 * The demo data has exactly one gap (yesterday) and a fortnight of history,
 * which is the one shape the tests above can see. Blanking more days is how
 * the other two shapes are reached: several gaps at once, and too little
 * history to call anything typical. A test setup step, not a product action —
 * hence the raw delete rather than a retraction.
 */
async function blankDays(page: import('@playwright/test').Page, match: (day: string) => boolean) {
  await open(page, '/today?view=week')
  await expect(page.getByRole('heading', { name: /This week/ })).toBeVisible({ timeout: 15_000 })
  const rows = await storedRows<{ id: string; day: string }>(page, 'meals')
  const ids = rows.filter((row) => match(row.day)).map((row) => row.id)
  await page.evaluate(async (ids) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('timeline-health')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction('meals', 'readwrite')
    for (const id of ids) tx.objectStore('meals').delete(id)
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()
  }, ids)
}

test('several blank days are filled together, one estimate each, and undone together', async ({
  page,
}) => {
  // Sunday and Monday join yesterday: three gaps before today.
  const blank = [dayKey(-3), dayKey(-2)]
  await blankDays(page, (day) => blank.includes(day))

  await open(page, '/today?view=week')
  await expect(page.getByText('3 days have no meals on them')).toBeVisible({ timeout: 15_000 })
  const before = (await storedRows(page, 'meals')).length

  await page.getByRole('button', { name: 'Fill all 3 from your average' }).click()
  await expect(page.getByText('3 days filled from your average.')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.estimated-fill')).toHaveCount(3)

  // One record per day — never one per meal, and never two on one day.
  const written = (await storedRows<{ day: string; data: { provenance: { source: string } } }>(
    page,
    'meals',
  )).filter((row) => row.data.provenance.source === 'PATTERN_FILL')
  expect(written.map((row) => row.day).sort()).toEqual([dayKey(-3), dayKey(-2), dayKey(-1)])
  expect((await storedRows(page, 'meals')).length).toBe(before + 3)

  // Undo takes all three back, and the offer returns for all three.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByText('3 days have no meals on them')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.estimated-fill')).toHaveCount(0)
})

test('with too little history, the gap is named but no fill is offered', async ({ page }) => {
  /*
    Every day before today blanked. There is nothing to average, and a fill
    drawn from nothing would be a number with no basis dressed as a habit —
    so the card says why instead of offering a button.
  */
  const today = dayKey(0)
  await blankDays(page, (day) => day < today)

  await open(page, '/today?view=week')
  await expect(page.getByText(/days have no meals on them/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Not enough logged days/)).toBeVisible()
  await expect(page.getByRole('button', { name: /from your average/ })).toHaveCount(0)
})

test('in Hebrew the offer, the fill and the estimate note all read right to left', async ({
  page,
}) => {
  await switchToHebrew(page)
  await open(page, '/today?view=week')

  await expect(page.getByText('ימים חסרים')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'למלא מהממוצע שלכם' }).click()
  await expect(page.getByText('מולא מהממוצע שלכם.')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.estimated-fill').first()).toBeVisible()
  await expect(page.getByText('הערכה', { exact: true })).toBeVisible()

  await open(page, `/nutrition?d=${dayKey(-1)}`)
  const note = page.getByText(/ערכי היום הממוצע/)
  await expect(note).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByText('נרשמו (0)')).toBeVisible()

  /*
    The layout, not just the words. A right-to-left page that overflows
    sideways is the classic symptom of a physical margin or position left in
    a component — it is invisible in English and breaks the page in Hebrew.
  */
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('the average reaches back past a fortnight of estimates to the days that were logged', async ({
  page,
}) => {
  /*
    Reported from real use: two weeks filled rather than logged, plenty of
    meals before that — and the card said there was not enough history.

    The average was drawn from the last 14 CALENDAR days, and filled days are
    rightly not evidence. So every fill shrank the window it depended on, and
    after two weeks of it the feature switched itself off. Here the last
    fortnight is blanked and six logged days remain, all older than that.
  */
  const today = dayKey(0)
  const fortnightAgo = dayKey(-14)
  await blankDays(page, (day) => day >= fortnightAgo && day < today)

  await open(page, '/today?view=week')
  await expect(page.getByText(/days have no meals on them/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Not enough logged days/)).toHaveCount(0)

  // It says where the number comes from, because it is not "the last two weeks".
  await expect(page.getByText(/Average of your last 6 logged days/)).toBeVisible()

  await page.getByRole('button', { name: /from your average/ }).click()
  await expect(page.getByText(/filled from your average/i)).toBeVisible({ timeout: 15_000 })

  // The six logged days are all the same 1,990 kcal day, so that is the average.
  const estimates = (
    await storedRows<{
      data: { provenance: { source: string }; items: { nutrients: { energy: { value: number } } }[] }
    }>(page, 'meals')
  ).filter((row) => row.data.provenance.source === 'PATTERN_FILL')
  expect(estimates.length).toBeGreaterThan(0)
  for (const row of estimates) expect(row.data.items[0].nutrients.energy.value).toBe(1990)
})
