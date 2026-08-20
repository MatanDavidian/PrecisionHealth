/**
 * Photo handling — in memory only.
 *
 * The photo is never written to disk (spec §3). It is downscaled to keep the
 * upload small and the model cheap, sent once, and dropped. What outlives it
 * is `PhotoMeta`: enough to record what the model looked at, and to notice the
 * same photo logged twice, without keeping pixels.
 */
import type { PhotoMeta } from './estimator'

/** Longest edge sent to the provider. Beyond this, cost rises and accuracy does not. */
export const MAX_DIMENSION = 1280
export const JPEG_QUALITY = 0.82

/** Pure, so the scaling rule is testable without a canvas. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const factor = max / longest
  return { width: Math.round(width * factor), height: Math.round(height * factor) }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Browser-only: needs createImageBitmap and a canvas. */
export async function downscale(file: Blob, max = MAX_DIMENSION): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const size = fitWithin(bitmap.width, bitmap.height, max)

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  return blob ?? file
}

export async function describePhoto(blob: Blob): Promise<PhotoMeta> {
  const bitmap = await createImageBitmap(blob)
  const meta: PhotoMeta = {
    width: bitmap.width,
    height: bitmap.height,
    bytes: blob.size,
    sha256: await sha256Hex(blob),
  }
  bitmap.close()
  return meta
}

export async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the photo'))
    reader.readAsDataURL(blob)
  })
}
