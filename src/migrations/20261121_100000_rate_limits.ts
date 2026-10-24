import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_rate_limits`, the shared counter behind the account and
// two-factor guessing limits. Per-isolate counters let a client spread across
// Workers isolates multiply its allowance; one row per key in D1 is seen by
// every isolate.
//
// Nothing existing is altered. `CREATE ... IF NOT EXISTS` makes the migration
// safe to replay. Expired rows are pruned opportunistically by the limiter
// (src/features/security/sharedRateLimit.ts), so no scheduled job is needed.
//
// The Drizzle mirror is src/cms/db/schema/rateLimits.ts. Change one, change
// the other.

const RATE_LIMITS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_rate_limits\` (
  \`key\` text PRIMARY KEY NOT NULL,
  \`count\` integer NOT NULL,
  \`window_start\` integer NOT NULL,
  \`expires_at\` integer NOT NULL
)`

const RATE_LIMITS_INDEXES = ['CREATE INDEX IF NOT EXISTS `eg_rate_limits_expires_at_idx` ON `eg_rate_limits` (`expires_at`)']

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(RATE_LIMITS_TABLE))
  for (const statement of RATE_LIMITS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_rate_limits is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: the table is left in place.
  engine.logger.info('[migrate] Down is a no-op - eg_rate_limits is left in place.')
}
