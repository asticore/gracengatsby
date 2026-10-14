import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_cron_runs`, one row per job run started by the five-minute cron route
// (src/app/(engage)/api/cron/publish-scheduled). A row is inserted when a job starts
// and updated when it finishes, so a run that dies part-way leaves a visible row with
// no finished_at rather than no trace at all.
//
// Written with raw SQL by src/features/cron/runJob.ts. Column names are the ones that
// file uses; change one, change both. Idempotent: CREATE ... IF NOT EXISTS throughout.

const CRON_RUNS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_cron_runs\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`job\` text NOT NULL,
  \`started_at\` text NOT NULL,
  \`finished_at\` text,
  \`ok\` integer,
  \`error\` text,
  \`duration_ms\` integer
)`

// Two indexes: the status page reads the newest run per job (job, id) and the
// housekeeping prune and staleness check read by time (started_at).
const CRON_RUNS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_cron_runs_job_idx` ON `eg_cron_runs` (`job`, `id`)',
  'CREATE INDEX IF NOT EXISTS `eg_cron_runs_started_idx` ON `eg_cron_runs` (`started_at`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(CRON_RUNS_TABLE))
  for (const statement of CRON_RUNS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_cron_runs is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, like the backups migration: the run history is kept on a rollback.
  engine.logger.info('[migrate] Down is a no-op - eg_cron_runs is left in place.')
}