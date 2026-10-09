/**
 * What the database must contain for the deployed functions to work.
 *
 * The health check compares production against this list and names anything
 * missing. It exists because of 25 Sep 2026: `estimate-food` was deployed
 * calling `reserve_analysis`, migrations 0011–0012 had never been applied, and
 * every analysis failed for a week with nothing to say so.
 *
 * Kept honest by `src/data/__tests__/schemaExpectations.test.ts`, which fails
 * if a function calls a table, RPC or outcome that is not listed here, or if
 * something listed here is not created by any migration.
 */
export const EXPECTED_SCHEMA = {
  /** Called by the functions, or by the SQL functions they call. */
  functions: [
    'reserve_analysis',
    'settle_analysis',
    'release_analysis',
    'reservation_grace',
    'health_missing',
  ],
  tables: [
    'app_admins',
    'billing_events',
    'consents',
    'device_tokens',
    'goals',
    'inferences',
    'meals',
    'observations',
    'profiles',
    'sleep',
    'subscriptions',
    'usage',
    'user_preferences',
    'workouts',
  ],
  /** Every outcome the functions write to `usage`; the check constraint must allow each. */
  outcomes: [
    'OK',
    'OK_FOLLOWUP',
    'RESERVED',
    'SETTLED_LATE',
    'REFUSED_QUOTA',
    'REFUSED_BUDGET',
    'REFUSED_NO_KEY',
    'PROVIDER_ERROR',
    'UNREADABLE',
  ],
} as const
