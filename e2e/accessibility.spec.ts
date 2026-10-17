import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { open } from './app'

/**
 * An automated accessibility scan of the screens a stranger meets
 * (docs/PHASE-1-FINISH.md, P3), against WCAG 2.1 A and AA.
 *
 * One exception, written down rather than hidden: the brand's orange and
 * green — as text, and as the fill behind white button text — measure 2.7–4.1
 * against the 4.5 AA asks. The owner compared the passing shades and kept the
 * brand (2026-10-17, docs/PHASE-1-FINISH.md, P3). Everything else, the greys
 * included, must pass.
 */
const PENDING_BRAND_COLOURS = ['#c2673e', '#6f7f53']

const SCREENS = ['/log', '/today', '/today?view=week', '/nutrition', '/settings', '/signin', '/privacy', '/terms']

for (const path of SCREENS) {
  test(`${path} passes an accessibility scan`, async ({ page }) => {
    await open(page, path)
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 })
    // Let the numbers finish counting up, so contrast is read on the settled screen.
    await page.waitForTimeout(800)

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const problems = violations.flatMap((violation) =>
      violation.nodes
        .filter((node) => {
          if (violation.id !== 'color-contrast') return true
          const summary = node.failureSummary ?? ''
          return !PENDING_BRAND_COLOURS.some((colour) => summary.includes(colour))
        })
        .map((node) => `${violation.id}: ${node.target.join(' ')} — ${(node.failureSummary ?? '').split('\n')[1]?.trim()}`),
    )
    expect(problems).toEqual([])
  })
}
