import { describe, expect, it } from 'vitest'
import { fitWithin, MAX_DIMENSION, sha256Hex } from '../photo'

describe('downscaling maths', () => {
  it('leaves a small photo alone', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('caps the longest edge and keeps the aspect ratio', () => {
    const landscape = fitWithin(4032, 3024)
    expect(landscape.width).toBe(MAX_DIMENSION)
    expect(landscape.height).toBe(960)
    expect(landscape.width / landscape.height).toBeCloseTo(4032 / 3024, 2)
  })

  it('caps the tall edge for a portrait photo', () => {
    const portrait = fitWithin(3024, 4032)
    expect(portrait.height).toBe(MAX_DIMENSION)
    expect(portrait.width).toBe(960)
  })
})

describe('photo identity', () => {
  it('hashes content, so the same photo hashes the same', async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])])
    const b = new Blob([new Uint8Array([1, 2, 3])])
    const c = new Blob([new Uint8Array([1, 2, 4])])
    expect(await sha256Hex(a)).toBe(await sha256Hex(b))
    expect(await sha256Hex(a)).not.toBe(await sha256Hex(c))
  })
})
