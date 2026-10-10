import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { PRODUCT_NAME } from '../brand'

/**
 * What makes vimetry.app installable — and what the Android app is built
 * from (docs/ANDROID-APP.md, step 1). Checked here because a broken manifest
 * fails silently: the browser just stops offering "Install".
 */

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(path)
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

describe('the web app manifest', () => {
  it('names the app as brand.ts does', () => {
    expect(manifest.name).toBe(PRODUCT_NAME)
    expect(manifest.short_name).toBe(PRODUCT_NAME)
  })

  it('opens standalone, inside its own scope', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.scope).toBe('/')
    expect(manifest.start_url.startsWith('/')).toBe(true)
    expect(manifest.id).toBe('/')
  })

  it('has the icons Chrome and Android require, at the sizes it claims', () => {
    for (const purpose of ['any', 'maskable']) {
      for (const size of [192, 512]) {
        const icon = manifest.icons.find((i: { sizes: string; purpose: string }) =>
          i.sizes === `${size}x${size}` && i.purpose === purpose)
        expect(icon, `${purpose} ${size}`).toBeDefined()
        expect(pngSize(`public${icon.src}`)).toEqual([size, size])
      }
    }
  })

  it('uses the app’s own colours', () => {
    const css = readFileSync('src/styles.css', 'utf8')
    const canvas = css.match(/--color-canvas:\s*(#[0-9a-f]{6})/i)![1]
    expect(manifest.background_color).toBe(canvas)
    expect(manifest.theme_color).toBe(canvas)
  })
})

describe('the other icons', () => {
  it('apple-touch-icon is 180×180, and the Play Store icon 512×512', () => {
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual([180, 180])
    expect(pngSize('public/icons/play-store-512.png')).toEqual([512, 512])
  })

  it('the page links the manifest and the iOS icon', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('href="/icons/apple-touch-icon.png"')
    expect(existsSync('public/sw.js')).toBe(true)
  })
})
