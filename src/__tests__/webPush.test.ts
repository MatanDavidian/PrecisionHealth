import { createECDH, createPublicKey, verify } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  b64url,
  encryptPayload,
  generateVapidKeys,
  isPushEndpoint,
  isPushKeys,
  vapidAuthorization,
} from '../../supabase/functions/_shared/webPush'

/**
 * Web Push encryption and signing (supabase/functions/_shared/webPush.ts),
 * checked against implementations that are not ours.
 *
 * A round trip through our own code would pass even if both halves shared a
 * misreading of the RFC. So the message is decrypted by `http_ece`, the
 * reference implementation by the author of RFC 8188 and 8291, and the
 * signature is verified by Node's own crypto, not by Web Crypto.
 */
const ece = createRequire(import.meta.url)('http_ece') as {
  decrypt: (buffer: Buffer, params: Record<string, unknown>) => Buffer
}

/** A browser: its key pair and auth secret, as a real one hands them over. */
function browser() {
  const keys = createECDH('prime256v1')
  keys.generateKeys()
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return { keys, p256dh: b64url.encode(keys.getPublicKey()), auth: b64url.encode(auth) }
}

describe('encryption (RFC 8291)', () => {
  it('a browser can read what we send, decrypted by the reference implementation', async () => {
    const ua = browser()
    const message = JSON.stringify({ title: 'Vimetry', body: 'Time to log today. ✓ עברית' })
    const sealed = await encryptPayload(new TextEncoder().encode(message), ua.p256dh, ua.auth)
    const opened = ece.decrypt(Buffer.from(sealed), { version: 'aes128gcm', privateKey: ua.keys, authSecret: ua.auth })
    expect(opened.toString('utf8')).toBe(message)
  })

  it('is fresh every time: a new salt and a new sender key per message', async () => {
    const ua = browser()
    const a = await encryptPayload(new TextEncoder().encode('same'), ua.p256dh, ua.auth)
    const b = await encryptPayload(new TextEncoder().encode('same'), ua.p256dh, ua.auth)
    expect(b64url.encode(a)).not.toBe(b64url.encode(b))
  })

  it('cannot be read with another browser’s keys', async () => {
    const ua = browser()
    const stranger = browser()
    const sealed = await encryptPayload(new TextEncoder().encode('private'), ua.p256dh, ua.auth)
    expect(() =>
      ece.decrypt(Buffer.from(sealed), { version: 'aes128gcm', privateKey: stranger.keys, authSecret: stranger.auth }),
    ).toThrow()
  })
})

describe('signing (VAPID, RFC 8292)', () => {
  it('signs a token for the push service that verifies with our public key', async () => {
    const keys = await generateVapidKeys()
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:support@vimetry.app', 1_800_000_000)
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, head, claims, signature, k] = match!
    expect(k).toBe(keys.publicKey)
    expect(JSON.parse(new TextDecoder().decode(b64url.decode(head)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(b64url.decode(claims)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_800_000_000 + 12 * 3600,
      sub: 'mailto:support@vimetry.app',
    })
    // Verified by Node's crypto, from the 65-byte public key alone.
    const raw = b64url.decode(keys.publicKey)
    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: b64url.encode(raw.slice(1, 33)), y: b64url.encode(raw.slice(33, 65)) },
      format: 'jwk',
    })
    const ok = verify(
      'sha256',
      Buffer.from(`${head}.${claims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(b64url.decode(signature)),
    )
    expect(ok).toBe(true)
  })
})

describe('what a subscription may say', () => {
  it('accepts the push services browsers use', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc:def')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/QW1hemluZw')).toBe(true)
    expect(isPushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=abc')).toBe(true)
  })

  it('refuses anywhere else, so the server cannot be pointed at an address of a caller’s choosing', () => {
    expect(isPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false)
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false)
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(isPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false)
    expect(isPushEndpoint('https://localhost/x')).toBe(false)
    expect(isPushEndpoint(42)).toBe(false)
  })

  it('checks the browser’s keys are the right size', () => {
    const ua = browser()
    expect(isPushKeys(ua.p256dh, ua.auth)).toBe(true)
    expect(isPushKeys(ua.p256dh.slice(0, 20), ua.auth)).toBe(false)
    expect(isPushKeys(ua.p256dh, 'short')).toBe(false)
  })
})
