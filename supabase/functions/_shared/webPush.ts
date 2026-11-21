/**
 * Web Push, by hand: the message encrypted to the browser (RFC 8291,
 * aes128gcm) and signed for the push service (VAPID, RFC 8292).
 *
 * Written against Web Crypto alone, with no library and no imports, for two
 * reasons: the edge runtime's Node compatibility is not something a
 * reminder should depend on, and a file with no imports can also be loaded
 * by the Node test suite, which checks it against an independent
 * implementation (src/__tests__/webPush.test.ts).
 *
 * The push service sees only the encrypted bytes, the address, and a
 * time-to-live. The words of a reminder are readable only by the browser
 * that subscribed.
 */

const enc = new TextEncoder()

/** Bytes on a plain ArrayBuffer: what Web Crypto and fetch accept. */
type Bytes = Uint8Array<ArrayBuffer>

const bytes = (text: string): Bytes => new Uint8Array(enc.encode(text))

export const b64url = {
  encode(bytes: Uint8Array): string {
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(text: string): Bytes {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  },
}

const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The server's signing pair. The public half is what browsers subscribe with. */
export interface VapidKeys {
  /** Uncompressed P-256 point, base64url: what `applicationServerKey` takes. */
  publicKey: string
  privateJwk: JsonWebKey
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey: b64url.encode(raw), privateJwk }
}

/**
 * The Authorization header: a short-lived ES256 token naming the push
 * service as its audience and us as its sender (RFC 8292).
 */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = b64url.encode(bytes(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url.encode(
    bytes(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: subject })),
  )
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...keys.privateJwk, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // Web Crypto's ECDSA signature is already r || s, the form JWS wants.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes(`${header}.${claims}`)),
  )
  return `vapid t=${header}.${claims}.${b64url.encode(signature)}, k=${keys.publicKey}`
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** The record size written into the header: anything above the message plus 17 bytes. */
const RECORD_SIZE = 4096

/**
 * The message, encrypted to one browser (RFC 8291, a single aes128gcm record).
 *
 * `fixed` pins the random parts, for tests only: the RFC's own example uses
 * a given salt and key pair.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  browserPublicKey: string,
  authSecret: string,
  fixed?: { salt: Bytes; senderKeys: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = b64url.decode(browserPublicKey)
  const auth = b64url.decode(authSecret)
  const sender =
    fixed?.senderKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey))
  const browserKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: browserKey }, sender.privateKey, 256),
  )

  // RFC 8291 §3.4: the browser's auth secret salts the shared secret into the input keying material.
  const ikm = await hkdf(auth, shared, concat(bytes('WebPush: info\0'), uaPublic, senderPublic), 32)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  // RFC 8188: the content key and nonce, from a fresh salt per message.
  const contentKey = await hkdf(salt, ikm, bytes('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, bytes('Content-Encoding: nonce\0'), 12)

  // One record, so it is also the last: the 0x02 delimiter, no padding.
  const record = concat(plaintext, new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aes, record))

  // Header: salt (16) | record size (4, big-endian) | key id length (1) | key id (the sender's public key).
  const header = new Uint8Array(16 + 4 + 1 + senderPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = senderPublic.length
  header.set(senderPublic, 21)
  return concat(header, sealed)
}

/** Where a browser asked to be reached, as it hands it over. */
export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * The push services browsers actually use. A subscription naming any other
 * address is refused: the server would otherwise POST to wherever a caller
 * pointed it.
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.port !== '') return false
    return PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

/** A browser key and secret of the right shape: a 65-byte point and 16 bytes. */
export function isPushKeys(p256dh: unknown, auth: unknown): boolean {
  try {
    return (
      typeof p256dh === 'string' &&
      typeof auth === 'string' &&
      b64url.decode(p256dh).length === 65 &&
      b64url.decode(auth).length === 16
    )
  } catch {
    return false
  }
}

export type PushOutcome =
  /** Accepted by the push service. */
  | 'SENT'
  /** The browser unsubscribed or the address expired (404, 410): forget it. */
  | 'GONE'
  /** Anything else: try again another day. */
  | 'FAILED'

export async function sendPush(
  target: PushTarget,
  message: unknown,
  keys: VapidKeys,
  options: { subject: string; ttlSeconds: number; topic?: string },
): Promise<{ outcome: PushOutcome; status: number }> {
  try {
    const body = await encryptPayload(bytes(JSON.stringify(message)), target.p256dh, target.auth)
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttlSeconds),
        Urgency: 'normal',
        ...(options.topic ? { Topic: options.topic } : {}),
        Authorization: await vapidAuthorization(target.endpoint, keys, options.subject),
      },
      body,
    })
    await response.body?.cancel()
    if (response.status === 404 || response.status === 410) return { outcome: 'GONE', status: response.status }
    return { outcome: response.ok ? 'SENT' : 'FAILED', status: response.status }
  } catch {
    return { outcome: 'FAILED', status: 0 }
  }
}
