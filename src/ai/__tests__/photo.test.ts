import { describe, expect, it } from 'vitest'
import { fitWithin, isHeicHeader, looksLikeHeic, MAX_DIMENSION, sha256Hex } from '../photo'

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

describe('data URL encoding', () => {
  it('encodes bytes as a base64 data URL', async () => {
    const { toDataUrl } = await import('../photo')
    const url = await toDataUrl(new Blob([new Uint8Array([72, 105])], { type: 'image/jpeg' }))
    expect(url).toBe('data:image/jpeg;base64,SGk=')
  })

  it('survives a payload large enough to overflow a naive spread', async () => {
    const { toDataUrl } = await import('../photo')
    const url = await toDataUrl(new Blob([new Uint8Array(300_000)], { type: 'image/jpeg' }))
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
  })
})

describe('recognising an iPhone HEIC photo', () => {
  /** An ISO-BMFF `ftyp` box: size, 'ftyp', major brand, version, compatible brands. */
  const ftyp = (major: string, ...compatible: string[]) => {
    const text = `ftyp${major}\0\0\0\0${compatible.join('')}`
    const bytes = new Uint8Array(4 + text.length)
    new DataView(bytes.buffer).setUint32(0, bytes.length)
    bytes.set([...text].map((c) => c.charCodeAt(0)), 4)
    return bytes
  }

  it('knows the HEIC brands an iPhone writes', () => {
    expect(isHeicHeader(ftyp('heic', 'mif1', 'heic'))).toBe(true)
    expect(isHeicHeader(ftyp('heix', 'mif1'))).toBe(true)
  })

  it('reads the generic HEIF brand by what it is compatible with', () => {
    expect(isHeicHeader(ftyp('mif1', 'mif1', 'heic'))).toBe(true)
    // AVIF shares the container and the generic brand; Chrome opens AVIF fine.
    expect(isHeicHeader(ftyp('mif1', 'mif1', 'avif'))).toBe(false)
    expect(isHeicHeader(ftyp('avif', 'mif1', 'avif'))).toBe(false)
  })

  it('is not fooled by a JPEG, a PNG or too few bytes', () => {
    expect(isHeicHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]))).toBe(false)
    expect(isHeicHeader(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]))).toBe(false)
    expect(isHeicHeader(new Uint8Array([0, 0, 0]))).toBe(false)
  })

  it('goes by the bytes when the file is misnamed, and by the type when there are none', async () => {
    expect(await looksLikeHeic(new Blob([ftyp('heic', 'mif1', 'heic')], { type: 'image/jpeg' }))).toBe(true)
    expect(await looksLikeHeic(new Blob([], { type: 'image/heif' }))).toBe(true)
    expect(await looksLikeHeic(new Blob(['not a picture'], { type: '' }))).toBe(false)
  })
})
