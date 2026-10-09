import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * An iPhone photo picked where the browser cannot read it.
 *
 * iOS converts HEIC to JPEG when a photo is picked in Safari, so this reaches
 * the app from Android and desktop browsers: a photo copied off the phone.
 * Chromium cannot decode HEIC, which makes this the real behaviour of the
 * browser under test, not a simulation of it.
 *
 * Before: the decode failure went uncaught and the analysis spun for ever.
 */

/** Enough of a HEIC file for a browser to recognise it and fail to decode it. */
function heicBytes(): Buffer {
  const ftyp = Buffer.from('\0\0\0\x18ftypheic\0\0\0\0mif1heic', 'latin1')
  return Buffer.concat([ftyp, Buffer.alloc(512, 7)])
}

test('an iPhone HEIC photo is named, with how to send it instead — not a spinner', async ({ page }) => {
  await open(page, '/log')
  // Named .jpg on purpose: Android often loses the extension and the type.
  await page.setInputFiles('input[type=file]', { name: 'IMG_0412.jpg', mimeType: 'image/jpeg', buffer: heicBytes() })

  await expect(page.getByText(/This is an iPhone photo in HEIC format/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Formats → Most Compatible/)).toBeVisible()
  // The same file would fail the same way, so no "Try again".
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('a file that is not a picture at all says so', async ({ page }) => {
  await open(page, '/log')
  await page.setInputFiles('input[type=file]', { name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a picture') })
  await expect(page.getByText(/could not be opened as a picture/)).toBeVisible({ timeout: 15_000 })
})
