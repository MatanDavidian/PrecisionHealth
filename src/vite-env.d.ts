/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** True only in the browser-test build. See `define` in vite.config.ts. */
declare const __FAKE_ESTIMATOR__: boolean
