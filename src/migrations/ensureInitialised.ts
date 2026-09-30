/**
 * First-run bootstrap: makes a freshly deployed instance (for example one
 * created with the README's "Deploy to Cloudflare" button) set itself up.
 *
 * The button's build only ships the Worker; it never runs the schema
 * migrations or the starter-content seed. Without this, a brand-new D1 database
 * is empty and every page 500s with "no such table". On the first request that
 * reaches `getEngine()` we look at `eg_migrations`; if the table is missing or
 * empty the database is fresh, so we run the same sequence `/api/internal-migrate`
 * and `/api/internal-seed` run (both idempotent), once per isolate.
 *
 * Already-migrated databases (production) cost one small read per cold isolate.
 * Upgrades to an existing database still go through `/api/internal-migrate`
 * (`pnpm run deploy:migrate`); this only covers the empty-database case.
 *
 * Skipped during `next build` and under vitest, where there is no real database
 * to initialise.
 */
import { resolveD1Binding } from '@/cms/db/connect'
import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { seedHomeAndTemplates } from '@/seed/seedHomeAndTemplates'
import type { Engine } from '@/localapi/engine'

let pending: Promise<void> | null = null

async function isFreshDatabase(db: D1Database): Promise<boolean> {
  const table = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='eg_migrations'`).all()
  if (table.results.length === 0) return true
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM eg_migrations`).first<{ n: number }>()
  return !row || row.n === 0
}

async function initialise(engine: Engine): Promise<void> {
  const db = await resolveD1Binding()
  if (!(await isFreshDatabase(db))) return
  consoleLogger.info('Fresh database detected - running first-run migrations and seed.')
  const { errorCount } = await runInternalMigrate(db, consoleLogger)
  if (errorCount > 0) throw new Error(`First-run migration finished with ${errorCount} error(s).`)
  await seedHomeAndTemplates(engine)
}

export function ensureInitialised(engine: Engine): Promise<void> {
  if (process.env.VITEST || process.env.NEXT_PHASE === 'phase-production-build') return Promise.resolve()
  if (!pending) {
    pending = initialise(engine).catch((error: unknown) => {
      pending = null // retry on the next request
      consoleLogger.error(`First-run initialisation failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  return pending
}
