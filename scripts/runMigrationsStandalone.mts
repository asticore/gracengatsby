/**
 * From-scratch CLI-equivalent of `pnpm cms migrate` (the real `payload`
 * binary), built on top of `src/localapi/migrate.ts`'s `runMigrations` -
 * see that file's own header comment for the full ground-truth citations.
 *
 * NOT wired into `db:local`/`deploy:database` yet - same "standalone, proven,
 * not cut over" pattern every other `src/localapi/*` module in this removal
 * project already follows. Run it by hand to verify it against real local
 * dev state, side by side with the existing `pnpm run db:local`:
 *
 *   NODE_OPTIONS=--no-deprecation npx tsx scripts/runMigrationsStandalone.mts
 *
 * Talks to the local emulated D1 through wrangler's platform proxy, same
 * connection pattern as `scripts/prepareEngineTables.mts` (this script's own
 * `EngineDb` wrapper below is copied from that file verbatim, for the same
 * reason it exists there: `ensureMigrationsTable`/`bootstrapEngineTables`
 * need to run first, against the SAME bookkeeping-table state `runMigrations`
 * itself also depends on). Production is not reachable from here (see the
 * note on the D1 binding in wrangler.jsonc) - once this replaces the real
 * `engine.db.migrate(...)` call, `/api/internal-migrate` is where production
 * runs the equivalent sequence.
 *
 * Migration discovery is the existing, already-hand-maintained
 * `src/migrations/index.ts` barrel - see migrate.ts's header comment for why
 * this deliberately does not reimplement directory scanning.
 */

import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '../src/localapi/logger'
import { runMigrations, type Drizzle, type MigrationEntry } from '../src/localapi/migrate'
import { migrations } from '../src/migrations'
import { bootstrapEngineTables, type EngineDb } from '../src/migrations/schema/engineBootstrap'

const proxy = await getPlatformProxy<{ D1: D1Database }>({
  environment: process.env.CLOUDFLARE_ENV,
})

const d1 = proxy.env.D1

if (!d1) {
  console.error('[run-migrations] No D1 binding found - check wrangler.jsonc.')
  process.exit(1)
}

const engineDb: EngineDb = {
  exists: async (table) => {
    const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).all()
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

// Same pre-step `pnpm run db:local` already runs before `cms migrate` -
// idempotent, safe to run every time (see engineBootstrap.ts's own header).
const bootstrapReport = await bootstrapEngineTables(engineDb)
console.log('[run-migrations] bootstrap:', JSON.stringify(bootstrapReport, null, 2))

const db = drizzle(d1) as unknown as Drizzle

// See src/localapi/migrate.ts's header comment for why this cast is here:
// the barrel's entries are typed against real Payload's full
// MigrateUpArgs/MigrateDownArgs, ours narrows both to this app's real,
// confirmed usage (db + payload.logger only, req never touched).
const result = await runMigrations({
  db,
  engineDb,
  logger: consoleLogger,
  migrations: migrations as unknown as MigrationEntry[],
})

console.log(
  `[run-migrations] ran ${result.ran.length}, skipped ${result.skipped.length} (already applied), batch ${result.batch ?? '(none - nothing new to run)'}`,
)
if (result.ran.length > 0) {
  console.log('[run-migrations] ran:', result.ran.join(', '))
}

await proxy.dispose()
