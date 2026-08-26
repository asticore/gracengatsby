/**
 * Pre-step for `payload migrate`: gets the engine's bookkeeping tables onto
 * the `eg_` prefix before the migration runner touches the database.
 *
 * Run it with:
 *
 *   NODE_OPTIONS=--no-deprecation npx tsx scripts/prepareEngineTables.mts
 *
 * It is wired into `deploy:database` ahead of `payload migrate`, and is safe
 * to run by hand at any time - every step is idempotent.
 *
 * Why a script and not a migration: the runner reads its own history table on
 * startup, and the config now calls that table `eg_migrations`. Renaming it
 * from inside a migration is too late, because the runner has already tried to
 * read it. See src/migrations/schema/engineBootstrap.ts for the full reasoning.
 *
 * This talks to the local emulated D1 through wrangler's platform proxy - the
 * same handle the app config uses. Production is not reachable from here (see
 * the note on the D1 binding in wrangler.jsonc); it gets the identical
 * sequence through /api/internal-migrate instead.
 */

import { getPlatformProxy } from 'wrangler'

import { bootstrapEngineTables, type EngineDb } from '../src/migrations/schema/engineBootstrap'

const proxy = await getPlatformProxy<{ D1: D1Database }>({
  environment: process.env.CLOUDFLARE_ENV,
})

const d1 = proxy.env.D1

if (!d1) {
  console.error('[prepare-engine-tables] No D1 binding found - check wrangler.jsonc.')
  process.exit(1)
}

const db: EngineDb = {
  exists: async (table) => {
    const result = await d1
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .bind(table)
      .all()
    return (result.results?.length ?? 0) > 0
  },
  listTables: async () => {
    const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
    return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
  },
  columnsOf: async (table) => {
    const result = await d1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
  },
  run: (statement) => d1.prepare(statement).run(),
  countRows: async (table) => {
    const result = await d1.prepare(`SELECT COUNT(*) AS n FROM \`${table}\``).all()
    return ((result.results?.[0] as { n: number } | undefined)?.n ?? 0)
  },
}

const report = await bootstrapEngineTables(db)

console.log('[prepare-engine-tables]', JSON.stringify(report, null, 2))

if (report.keptLegacy.length > 0) {
  console.warn(
    `[prepare-engine-tables] Left ${report.keptLegacy.length} old-named table(s) in place because they still hold rows. Inspect them before removing.`,
  )
}

const errors = [...report.columns.errors, ...report.tables.errors]
if (errors.length > 0) {
  console.error('[prepare-engine-tables] Errors:', errors)
  process.exit(1)
}

await proxy.dispose()
