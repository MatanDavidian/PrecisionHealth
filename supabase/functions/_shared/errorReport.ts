/**
 * What an error report may carry, and how it is cleaned first.
 *
 * Shared by the app, which trims before sending, and `report-error`, which
 * scrubs again on arrival — the server cannot trust the client to have done
 * it. Plain TypeScript, so both Vite and Deno load it.
 *
 * The rule: a report says what broke, where in the app and in which build —
 * never who, and never what they had logged. An error message can quote
 * anything that was in a variable, so whatever looks like an address, a key,
 * a token, an embedded photo or a query string is replaced before it is kept.
 */

export type ErrorKind = 'error' | 'rejection' | 'render'

export interface ErrorReport {
  kind: ErrorKind
  message: string
  stack?: string
  route?: string
  version?: string
  browser?: string
}

export const LIMITS = { message: 500, stack: 4000, route: 200, version: 64, browser: 200 } as const

const REPLACEMENTS: [RegExp, string][] = [
  // A photo as a data URL: the most personal thing an error could quote.
  [/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '<data-url>'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>'],
  [/\b(sk|sb|pk|rk|whsec)[-_][A-Za-z0-9_-]{8,}/g, '<key>'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '<jwt>'],
  // Query strings and fragments in URLs: dates, codes, tokens.
  [/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1'],
  // Anything long and unbroken enough to be a secret or an id.
  [/\b[A-Za-z0-9_-]{32,}\b/g, '<redacted>'],
]

export function scrub(text: string): string {
  return REPLACEMENTS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text)
}

/**
 * A Content Security Policy violation, as one line — or undefined for one
 * that is not ours to fix.
 *
 * Only what was blocked, by origin, and which rule blocked it: Cloudflare's
 * injected analytics script was blocked this way for days with nothing
 * saying so. A browser extension's injections are its own business, and a
 * report-only policy blocks nothing.
 */
export function cspViolationMessage(violation: {
  blockedURI: string
  effectiveDirective: string
  disposition?: string
  sourceFile?: string
}): string | undefined {
  if (violation.disposition && violation.disposition !== 'enforce') return undefined
  const extension = /^(chrome|moz|safari(-web)?|ms-browser)-extension:/
  if (extension.test(violation.blockedURI) || extension.test(violation.sourceFile ?? '')) return undefined
  let blocked = violation.blockedURI || 'inline'
  try {
    const url = new URL(blocked)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'wss:') blocked = url.origin
    else blocked = url.protocol.replace(/:$/, '')
  } catch {
    // Already a keyword: inline, eval, data, blob.
  }
  return `Content Security Policy blocked ${blocked} (${violation.effectiveDirective})`
}

/** Only the path: `/nutrition?d=2026-10-09` is `/nutrition`. */
export function routeOf(path: string): string {
  return path.split(/[?#]/)[0].slice(0, LIMITS.route)
}

/** The same error, whatever numbers it happened to quote this time. */
export function fingerprintSource(report: Pick<ErrorReport, 'kind' | 'message' | 'stack'>): string {
  const topFrame = (report.stack ?? '').split('\n').find((line) => /:\d+:\d+/.test(line)) ?? ''
  return [report.kind, report.message.replace(/\d+/g, '#'), topFrame.replace(/\?[^:)]*/g, '').trim()].join('|')
}

/** Validated and cleaned, or undefined for anything that is not a report. */
export function cleanReport(input: unknown): ErrorReport | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Record<string, unknown>
  if (!['error', 'rejection', 'render'].includes(raw.kind as string)) return undefined
  if (typeof raw.message !== 'string' || !raw.message.trim()) return undefined
  const text = (value: unknown, limit: number) =>
    typeof value === 'string' && value ? scrub(value).slice(0, limit) : undefined
  return {
    kind: raw.kind as ErrorKind,
    message: text(raw.message, LIMITS.message)!,
    stack: text(raw.stack, LIMITS.stack),
    route: typeof raw.route === 'string' ? routeOf(raw.route) : undefined,
    version: text(raw.version, LIMITS.version),
    browser: text(raw.browser, LIMITS.browser),
  }
}
