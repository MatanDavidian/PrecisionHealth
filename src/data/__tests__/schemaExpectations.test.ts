import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXPECTED_SCHEMA } from '../../../supabase/functions/_shared/schema'

/**
 * The health check's list of what production must contain, kept honest.
 *
 * The list only helps if it is complete and real. Incomplete, and the check
 * stays green while a function calls something that does not exist — the
 * exact failure of 25 Sep 2026. Unreal, and it reports a typo as an outage.
 */

const FUNCTIONS_DIR = 'supabase/functions'
const MIGRATIONS_DIR = 'supabase/migrations'

const functionSources = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'node_modules')
  .map((entry) => readFileSync(join(FUNCTIONS_DIR, entry.name, 'index.ts'), 'utf8'))
  .join('\n')

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  .join('\n')

const all = (pattern: RegExp, source: string) =>
  [...new Set([...source.matchAll(pattern)].map((match) => match[1]))].sort()

describe('the health check knows everything the functions depend on', () => {
  it('lists every RPC a function calls', () => {
    for (const rpc of all(/\.rpc\('([a-z_]+)'/g, functionSources)) {
      expect(EXPECTED_SCHEMA.functions, rpc).toContain(rpc)
    }
  })

  it('lists every table a function reads or writes', () => {
    for (const table of all(/\.from\('([a-z_]+)'\)/g, functionSources)) {
      expect(EXPECTED_SCHEMA.tables, table).toContain(table)
    }
  })

  it('lists every outcome a function records', () => {
    for (const outcome of all(/outcome:\s*'([A-Z_]+)'/g, functionSources)) {
      expect(EXPECTED_SCHEMA.outcomes, outcome).toContain(outcome)
    }
  })
})

describe('everything the health check expects is created by a migration', () => {
  it('every function', () => {
    for (const name of EXPECTED_SCHEMA.functions) {
      expect(migrations, name).toMatch(new RegExp(`create (or replace )?function public\\.${name}\\(`))
    }
  })

  it('every table', () => {
    for (const name of EXPECTED_SCHEMA.tables) {
      expect(migrations, name).toMatch(new RegExp(`create table (if not exists )?(public\\.)?${name}\\b`))
    }
  })

  it('every outcome is allowed by the latest outcome constraint', () => {
    const constraints = [...migrations.matchAll(/add constraint usage_outcome_check[\s\S]*?\)\);/g)]
    const latest = constraints.at(-1)?.[0] ?? ''
    for (const outcome of EXPECTED_SCHEMA.outcomes) expect(latest, outcome).toContain(`'${outcome}'`)
  })
})
