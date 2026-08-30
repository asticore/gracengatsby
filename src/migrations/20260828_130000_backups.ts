import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Creates `eg_backups`, the record of every backup run.
//
// Written by hand rather than generated, for the same reason the audit log's
// migration is: the CLI's `migrate` cannot reach production D1 from this CI
// environment (see the note on the D1 binding in wrangler.jsonc), so the
// statements have to be safe to replay against a database that may already
// have them. `CREATE TABLE IF NOT EXISTS` covers the table.
//
// The column names here and the field names on the backups collection are two
// halves of one thing - the collection reads this table directly, and the run
// itself inserts into it with raw SQL because the scheduled path has no engine
// instance to go through. Change one, change all three.
//
// `backup_id` is the folder name at the destination, not a database id. It is
// indexed because retention deletes by it after a run, and unique because two
// rows claiming the same folder would make "which run wrote this?" unanswerable.

const BACKUPS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_backups\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`backup_id\` text,
  \`started_at\` text,
  \`finished_at\` text,
  \`trigger_source\` text,
  \`contents\` text,
  \`destination\` text,
  \`storage_path\` text,
  \`status\` text DEFAULT 'running' NOT NULL,
  \`size_bytes\` numeric DEFAULT 0,
  \`tables_backed_up\` numeric DEFAULT 0,
  \`media_objects\` numeric DEFAULT 0,
  \`error\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

// Three indexes and no more. Rows are written twice per run and read by the
// admin list (newest first), by retention (by backup_id) and by the scheduler
// (most recent success), which is exactly what these cover; anything else would
// cost on every write and earn nothing.
const BACKUPS_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_backups_backup_id_idx` ON `eg_backups` (`backup_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_backups_started_at_idx` ON `eg_backups` (`started_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_backups_status_finished_at_idx` ON `eg_backups` (`status`, `finished_at`)',
]

export async function up({ db, payload: engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(BACKUPS_TABLE))
  for (const statement of BACKUPS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_backups is present.')
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping the table on a rollback
  // would erase the record of when the last good copy was taken, which is
  // precisely the question being asked during a rollback.
  engine.logger.info('[migrate] Down is a no-op - eg_backups is left in place.')
}
