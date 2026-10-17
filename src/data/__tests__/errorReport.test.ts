import { describe, expect, it } from 'vitest'
import { cleanReport, cspViolationMessage, fingerprintSource, routeOf, scrub } from '../../../supabase/functions/_shared/errorReport'

describe('what an error report may not carry', () => {
  it('an embedded photo', () => {
    expect(scrub('bad image data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==')).toBe('bad image <data-url>')
  })

  it('an email address', () => {
    expect(scrub('no account for someone.else+tag@example.co.il')).toBe('no account for <email>')
  })

  it('keys and tokens', () => {
    expect(scrub('401 with sk-proj-abcdefghijklmnop')).toBe('401 with <key>')
    expect(scrub('key sb_publishable_abcdefghijkl')).toBe('key <key>')
    expect(scrub('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl')).toBe('jwt <jwt>')
    expect(scrub('token 0123456789abcdef0123456789abcdef01234567')).toBe('token <redacted>')
  })

  it('query strings and fragments in a URL', () => {
    expect(scrub('at https://vimetry.app/assets/index.js?v=2&d=2026-10-09:12:5'))
      .toBe('at https://vimetry.app/assets/index.js')
    expect(scrub('fetch https://x.supabase.co/rest/v1/meals?user_id=eq.abc failed'))
      .toBe('fetch https://x.supabase.co/rest/v1/meals failed')
  })

  it('leaves an ordinary message alone', () => {
    expect(scrub("Cannot read properties of undefined (reading 'items')"))
      .toBe("Cannot read properties of undefined (reading 'items')")
  })
})

describe('a report', () => {
  it('keeps the path and drops the query', () => {
    expect(routeOf('/nutrition?d=2026-10-09#top')).toBe('/nutrition')
  })

  it('is refused unless it is one', () => {
    expect(cleanReport(null)).toBeUndefined()
    expect(cleanReport({ kind: 'error', message: '  ' })).toBeUndefined()
    expect(cleanReport({ kind: 'exploit', message: 'x' })).toBeUndefined()
    expect(cleanReport({ kind: 'error', message: 42 })).toBeUndefined()
  })

  it('is cut to size and scrubbed on every field', () => {
    const report = cleanReport({
      kind: 'rejection',
      message: 'went wrong '.repeat(200) + ' me@example.com',
      stack: 'Error\n    at f (https://vimetry.app/a.js?x=1:1:2)',
      route: '/log?photo=1',
      version: 'abc',
      browser: 'Mozilla/5.0',
      userId: 'must-not-pass',
    })!
    expect(report.message.length).toBe(500)
    expect(report.stack).toBe('Error\n    at f (https://vimetry.app/a.js)')
    expect(report.route).toBe('/log')
    expect(Object.keys(report)).not.toContain('userId')
  })

  it('keeps the build’s commit, and only a commit', () => {
    const commit = '65aea51c0ffee0123456789abcdef0123456789a'
    expect(cleanReport({ kind: 'error', message: 'x', version: commit })!.version).toBe(commit)
    expect(cleanReport({ kind: 'error', message: 'x', version: 'me@example.com' })!.version).toBeUndefined()
  })

  it('groups the same error whatever numbers it quoted', () => {
    const a = fingerprintSource({ kind: 'error', message: 'Day 2026-10-09 has 3 meals', stack: 'Error\n  at x (a.js:10:5)' })
    const b = fingerprintSource({ kind: 'error', message: 'Day 2026-10-10 has 4 meals', stack: 'Error\n  at x (a.js:10:5)' })
    const elsewhere = fingerprintSource({ kind: 'error', message: 'Day 2026-10-10 has 4 meals', stack: 'Error\n  at y (b.js:3:1)' })
    expect(a).toBe(b)
    expect(a).not.toBe(elsewhere)
  })
})

describe('a Content Security Policy violation', () => {
  it('is reported by origin and rule, without the path or query', () => {
    expect(cspViolationMessage({
      blockedURI: 'https://static.cloudflareinsights.com/beacon.min.js?token=abc',
      effectiveDirective: 'script-src-elem',
      disposition: 'enforce',
    })).toBe('Content Security Policy blocked https://static.cloudflareinsights.com (script-src-elem)')
  })

  it('names an inline script or a data URL without quoting it', () => {
    expect(cspViolationMessage({ blockedURI: 'inline', effectiveDirective: 'script-src-elem' }))
      .toBe('Content Security Policy blocked inline (script-src-elem)')
    expect(cspViolationMessage({ blockedURI: 'data:image/png;base64,AAAA', effectiveDirective: 'img-src' }))
      .toBe('Content Security Policy blocked data (img-src)')
    expect(cspViolationMessage({ blockedURI: '', effectiveDirective: 'style-src-attr' }))
      .toBe('Content Security Policy blocked inline (style-src-attr)')
  })

  it('is not ours when an extension caused it, or when nothing was blocked', () => {
    expect(cspViolationMessage({ blockedURI: 'chrome-extension://abc/inject.js', effectiveDirective: 'script-src' }))
      .toBeUndefined()
    expect(cspViolationMessage({
      blockedURI: 'inline', effectiveDirective: 'script-src', sourceFile: 'moz-extension://abc/content.js',
    })).toBeUndefined()
    expect(cspViolationMessage({ blockedURI: 'https://x.example', effectiveDirective: 'img-src', disposition: 'report' }))
      .toBeUndefined()
  })
})
