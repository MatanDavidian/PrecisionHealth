import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
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
  },
}))
