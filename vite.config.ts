import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { PAGE_TITLE } from './src/brand'

/**
 * Which commit this build is.
 *
 * Cloudflare Pages names the commit it is building; a local build asks git.
 * Neither available — a tarball, a CI without history — says so rather than
 * guessing, because a wrong answer here is worse than none.
 */
function buildCommit(): string {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

/**
 * The headers `public/_headers` sets on every path (`/*`), for `vite preview`.
 *
 * Cloudflare reads that file; the preview server does not. Without this the
 * browser suite would run with no Content-Security-Policy at all, and a policy
 * that broke the app would be found first in production.
 */
function headersForEveryPath(): Record<string, string> {
  const headers: Record<string, string> = {}
  let inBlock = false
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    if (/^\S/.test(line)) inBlock = line.trim() === '/*'
    else if (inBlock && line.trim() && !line.trim().startsWith('#')) {
      const at = line.indexOf(':')
      headers[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
  }
  return headers
}

export default defineConfig(({ mode }) => ({
  preview: { headers: headersForEveryPath() },
  define: {
    /*
      Whether this build may use the test estimator at all.

      A build-time constant rather than a runtime check: when it is false the
      whole FakeEstimator is dead code and leaves the bundle, so `?fake=1` on
      the live site does nothing — it used to swap in canned estimates for
      anyone, signed in or not. Only the browser-test build sets it
      (playwright.config.ts).
    */
    __FAKE_ESTIMATOR__: JSON.stringify(process.env.VITE_ENABLE_FAKE === '1'),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      /*
        The page title comes from `src/brand.ts` like everything else.

        Without this the one occurrence a rename is most likely to miss is the
        one the outside world sees first — the browser tab, the bookmark, and
        the text a link preview falls back to.
      */
      name: 'product-name',
      transformIndexHtml: (html) => html.replace('%PAGE_TITLE%', PAGE_TITLE),
    },
    {
      /*
        The commit, in the page itself, where `curl` can read it.

        Once it was not obvious whether the live site was running the code
        being discussed — it was not, and the only way to tell was to download
        its JavaScript and search it for a string. This makes that one request
        and one comparison: `npm run check:live`.
      */
      name: 'build-commit',
      transformIndexHtml: (html) =>
        html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta name="build-commit" content="${buildCommit()}" />`,
        ),
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    /**
     * Tests run in Node, which does not see `.env.local` — Vite only exposes
     * it to the browser bundle. Loading it here with an empty prefix is what
     * lets the Supabase contract find its credentials; without it the suite
     * silently skips, which looks identical to "no project configured".
     */
    env: loadEnv(mode, process.cwd(), ''),
    /**
     * The browser suite is Playwright's, not Vitest's.
     *
     * Both default to `**\/*.spec.ts`, so without this Vitest picks up `e2e/`
     * and every file there fails to load with "Playwright Test did not expect
     * test() to be called here" — three red files sitting under a green test
     * count, which is exactly the kind of noise that trains people to ignore
     * the output. Run them with `npm run test:e2e`.
     */
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', 'e2e-live/**'],
  },
}))
