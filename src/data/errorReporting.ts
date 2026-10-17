/**
 * Tells us when the app breaks in someone's browser.
 *
 * Uncaught errors, unhandled promise rejections, screens that fail to render
 * (via ErrorBoundary), and anything the Content Security Policy blocks go to
 * the `report-error` function. What is sent
 * is cleaned first (`_shared/errorReport.ts`, and again on the server): the
 * message, the stack, the page's path without its query, the build, and the
 * browser. Never an account or anything logged.
 *
 * At most a few reports per page load, each distinct error once, and errors
 * that are not ours — browser extensions, cross-origin "Script error." — are
 * not sent at all.
 */
import { cleanReport, cspViolationMessage, routeOf, type ErrorKind } from '../../supabase/functions/_shared/errorReport'
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'

const MAX_PER_PAGE = 5
const sent = new Set<string>()

/** Noise that is not a fault in this app. */
const NOT_OURS = [/extension:\/\//, /^Script error\.?$/, /ResizeObserver loop/]

function buildVersion(): string | undefined {
  return document.querySelector<HTMLMetaElement>('meta[name="build-commit"]')?.content || undefined
}

export function reportError(kind: ErrorKind, cause: unknown): void {
  // Offline, failures are the network's, not bugs — and the report could not leave anyway.
  if (!isSupabaseConfigured || navigator.onLine === false) return
  const error = cause instanceof Error ? cause : undefined
  const message = error?.message ?? (typeof cause === 'string' ? cause : String(cause ?? ''))
  const stack = error?.stack
  if (!message || NOT_OURS.some((pattern) => pattern.test(message) || pattern.test(stack ?? ''))) return

  const key = `${kind}|${message}`
  if (sent.has(key) || sent.size >= MAX_PER_PAGE) return
  sent.add(key)

  const report = cleanReport({
    kind,
    message,
    stack,
    route: routeOf(location.pathname),
    version: buildVersion(),
    browser: navigator.userAgent,
  })
  if (!report) return
  void fetch(`${SUPABASE_URL}/functions/v1/report-error`, {
    method: 'POST',
    // keepalive: an error on the way out of a page should still arrive.
    keepalive: true,
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY! },
    body: JSON.stringify(report),
  }).catch(() => {
    // Reporting must never become a second error.
  })
}

export function installErrorReporting(): void {
  window.addEventListener('error', (event) => reportError('error', event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportError('rejection', event.reason))
  // Something the CSP blocked: a script, a font, a connection we forgot to allow.
  document.addEventListener('securitypolicyviolation', (event) => {
    const message = cspViolationMessage(event)
    if (message) reportError('error', message)
  })
}
