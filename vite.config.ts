import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { PAGE_TITLE } from './src/brand'

export default defineConfig(({ mode }) => ({
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
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
}))
