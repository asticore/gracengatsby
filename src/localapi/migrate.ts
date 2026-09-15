/**
 * From-scratch reimplementation of `.db.migrate(...)` - the last and biggest
 * of the four remaining `@/engine` shims scoped in
 * payload-removal-plan.md's "Full-removal cutover prerequisites" section
 * (logger/config/collections done; this is it).
 *
 * GROUND TRUTH, CONFIRMED BY READING REAL SOURCE DIRECTLY (not assumed):
 *
 * 1. `MigrateUpArgs`/`MigrateDownArgs`' real shape (`@payloadcms/db-d1-sqlite`'s
 *    `types.d.ts`) is `{ db: Drizzle, payload: Payload, req: PayloadRequest }`,
 *    where `Drizzle` is drizzle-orm's OWN exported type
 *    (`DrizzleD1Database<TSchema> & { $client: AnyD1Database }` from
 *    `drizzle-orm/d1` - not a payload-specific type at all, so it is imported
 *    directly from `drizzle-orm/d1` below, same as `src/cms/db` already does
 *    elsewhere in this app). Grepped every one of this app's 18 migration
 *    files' `up`/`down` signatures directly: NONE ever destructures or
 *    otherwise touches `req` - only `db` and (in about half of them)
 *    `payload.logger` (always destructured as `{ payload: engine }`). So the
 *    hand-rolled `MigrateUpArgs`/`MigrateDownArgs` below narrow `payload` to
 *    just `{ logger: EngineLogger }` (Stage 3's own shape) and `req` to an
 *    empty, never-read stub object - matching this app's real, confirmed
 *    usage exactly, per this directory's rule of reimplementing only the real
 *    surface actually exercised.
 *
 * 2. Read `@payloadcms/drizzle`'s real `migrate.js` directly. Its control flow
 *    (`runMigrationFile`, per migration): create a request, `initTransaction`,
 *    look up the transactional `db` handle, call `migration.up({db, payload,
 *    req})`, THEN `payload.create({collection: 'payload-migrations', data:
 *    {name, batch}, req})` to record it, THEN `commitTransaction`. On any
 *    error: `killTransaction`, log, `process.exit(1)` - no record is written
 *    for a migration that threw.
 *
 * 3. Batch numbering (same file): finds the existing migration doc with the
 *    lexicographically largest `name` (`sort: '-name'`, take `docs[0]`) and
 *    uses `docs[0].batch + 1`, defaulting to `1` when there is no history yet.
 *    Reproduced below as `SELECT batch FROM eg_migrations ORDER BY name DESC
 *    LIMIT 1` - the same logic against the same column, since migration names
 *    are timestamp-prefixed and therefore sort the same way lexicographically
 *    and chronologically.
 *
 * 4. Confirmed this app's own db adapter config (`engage.config.ts`'s
 *    `db: engageD1Adapter({ binding: cloudflare.env.D1, push: false })`) sets
 *    no `transactionOptions` - which means real Payload's own
 *    `defaultBeginTransaction` (`payload/dist/database/
 *    defaultBeginTransaction.js`: `return () => Promise.resolve(null)`) is
 *    what actually runs today. In other words, **this app's migrations
 *    already execute with NO real BEGIN/COMMIT wrapping in production** - the
 *    `initTransaction`/`commitTransaction` calls in step 2 above are already
 *    no-ops for this specific adapter configuration. This runner reproducing
 *    "no real transaction, just run the statements" is matching existing
 *    production behavior exactly, not a new gap.
 *
 * 5. Confirmed via a live investigation of drizzle-orm's own D1 driver that
 *    D1's HTTP driver DOES support real `BEGIN`/`COMMIT`/`ROLLBACK` when asked
 *    for - the no-op above is purely a consequence of this app's own adapter
 *    config, not a D1 platform limitation. Not changed here: reproducing the
 *    existing, already-shipping "no atomicity across statements within one
 *    migration" behavior is the parity bar this removal project holds itself
 *    to, not an opportunity to silently harden something that was never
 *    guaranteed before.
 *
 * ONE DELIBERATE, DOCUMENTED DEVIATION FROM REAL BEHAVIOR: real Payload's
 * migrate() calls `process.exit(1)` on a failed migration. That is reasonable
 * for a one-shot CLI process, but wrong for the OTHER real caller of this
 * surface - `/api/internal-migrate` is a Cloudflare Workers request handler,
 * and `process.exit()` there would kill the whole Worker rather than let the
 * route return an error response. `runMigrations` below THROWS instead on a
 * failed migration (recording nothing for it, same as real Payload) and
 * leaves `process.exit` as a decision for whichever caller wants it - the
 * future CLI-equivalent script calls `process.exit(1)` on a caught error
 * itself; the route can catch and return a 500. This is a safety-motivated
 * correction, not a fidelity gap.
 *
 * MIGRATION DISCOVERY: real Payload falls back to scanning a migrations
 * directory (`readMigrationFiles`) when no explicit list is passed. This app
 * already maintains its own definitive, hand-ordered list of all 18
 * migrations in `src/migrations/index.ts` (every migration is already added
 * to that barrel by hand today, confirmed by reading it - it is how new
 * migrations already get wired up in this project, with or without payload
 * removal). Re-implementing directory scanning + dynamic `import()` ordering
 * would be extra machinery solving a problem this app doesn't have - callers
 * of `runMigrations` below just pass that barrel's `migrations` array
 * directly.
 *
 * `down()` is deliberately NOT reimplemented here: grepped `package.json` and
 * every route under `src/app` for `migrate:down`/`migrateDown` - no call site
 * anywhere in this app ever runs it. Droppable, same as every other
 * confirmed-unused Payload feature flagged elsewhere in this project.
 */

import { sql } from 'drizzle-orm'
import type { AnyD1Database, DrizzleD1Database } from 'drizzle-orm/d1'

import { ensureMigrationsTable, type EngineDb } from '@/migrations/schema/engineBootstrap'

import type { EngineLogger } from './logger'

/** Real drizzle-orm's own exported D1 db-handle type (`drizzle-orm/d1`'s `drizzle()` return type) - not a payload-specific type. */
export type Drizzle = DrizzleD1Database<Record<string, unknown>> & { $client: AnyD1Database }

/** See this file's header comment: `payload`/`req` narrowed to this app's real, confirmed usage only. */
export type MigrateUpArgs = {
  db: Drizzle
  payload: { logger: EngineLogger }
  req: Record<string, never>
}

export type MigrateDownArgs = MigrateUpArgs

export type MigrationEntry = {
  name: string
  up: (args: MigrateUpArgs) => Promise<void>
  down: (args: MigrateDownArgs) => Promise<void>
}

export type RunMigrationsArgs = {
  db: Drizzle
  engineDb: EngineDb
  logger: EngineLogger
  migrations: MigrationEntry[]
}

export type RunMigrationsResult = {
  /** Names actually applied THIS run, in the order they ran. */
  ran: string[]
  /** Names already present in `eg_migrations` before this run started, in barrel order. */
  skipped: string[]
  /** The batch number used for `ran` (real Payload's own "one batch per invocation" semantics). `null` when nothing ran. */
  batch: number | null
}

export async function readAppliedMigrationNames(db: Drizzle): Promise<Set<string>> {
  const rows = (await db.all(sql`SELECT name FROM eg_migrations`)) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

/** See this file's header comment, point 3 - mirrors real Payload's `sort: '-name'`, `docs[0].batch + 1` exactly. */
export async function nextBatchNumber(db: Drizzle): Promise<number> {
  const rows = (await db.all(sql`SELECT batch FROM eg_migrations ORDER BY name DESC LIMIT 1`)) as {
    batch: number | null
  }[]
  const latest = Number(rows[0]?.batch ?? 0)
  return (Number.isFinite(latest) ? latest : 0) + 1
}

async function recordMigration(db: Drizzle, entry: { name: string; batch: number }): Promise<void> {
  const now = new Date().toISOString()
  await db.run(
    sql`INSERT INTO eg_migrations (name, batch, updated_at, created_at) VALUES (${entry.name}, ${entry.batch}, ${now}, ${now})`,
  )
}

/**
 * Runs every migration in `migrations` (barrel order) not yet recorded in
 * `eg_migrations`, in order, recording each as it completes. Ensures
 * `eg_migrations` exists first (reuses the already-built `ensureMigrationsTable`,
 * so this is safe to call against a genuinely fresh, table-less database).
 *
 * Throws on the first migration that fails, WITHOUT recording it (matching
 * real Payload) and without running any migration after it - see this file's
 * header comment for why this throws rather than calling `process.exit`
 * itself.
 */
export async function runMigrations(args: RunMigrationsArgs): Promise<RunMigrationsResult> {
  const { db, engineDb, logger, migrations } = args

  await ensureMigrationsTable(engineDb)

  const applied = await readAppliedMigrationNames(db)
  const batch = await nextBatchNumber(db)

  const ran: string[] = []
  const skipped: string[] = []

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      skipped.push(migration.name)
      continue
    }

    logger.info(`[migrate] Migrating: ${migration.name}`)
    try {
      await migration.up({ db, payload: { logger }, req: {} })
    } catch (err) {
      logger.error({ err }, `[migrate] Failed: ${migration.name}`)
      throw err instanceof Error ? err : new Error(`Migration "${migration.name}" failed: ${String(err)}`)
    }

    await recordMigration(db, { name: migration.name, batch })
    logger.info(`[migrate] Migrated:  ${migration.name}`)
    ran.push(migration.name)
  }

  return { ran, skipped, batch: ran.length > 0 ? batch : null }
}
