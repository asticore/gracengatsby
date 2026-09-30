import { resolveD1Binding } from '@/cms/db/connect'
import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'

let ready: Promise<void> | null = null

/**
 * Makes sure the local emulated D1 used by the cms/db tests has the full
 * schema (idempotent: a no-op on an already-migrated database). Replaces the
 * side-effect import of the old the original engine test config, which used to do this.
 */
export function ensureMigratedLocalDb(): Promise<void> {
  ready ??= (async () => {
    const db = await resolveD1Binding()
    const { errorCount } = await runInternalMigrate(db, consoleLogger)
    if (errorCount > 0) throw new Error(`Local D1 migration finished with ${errorCount} error(s).`)
  })()
  return ready
}
