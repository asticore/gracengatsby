import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates the `eg_redirects` collection table for managing URL redirects.
//
// Written by hand rather than generated, for the same reason other migrations are:
// the CLI's `migrate` cannot reach production D1 from this CI environment (see the
// note on the D1 binding in wrangler.jsonc), so every statement has to be safe to
// replay against a database that may already have them. `CREATE TABLE IF NOT EXISTS`
// covers the table; SQLite has no `ADD COLUMN IF NOT EXISTS`, so the one column add
// swallows the duplicate-column error instead - see `addColumn`.
//
// The column names here and the field names on the collection are two halves of
// one thing. Change one, change both.

const REDIRECTS = `CREATE TABLE IF NOT EXISTS \`eg_redirects\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`from_path\` text NOT NULL,
  \`to_path\` text NOT NULL,
  \`redirect_type\` text DEFAULT '301' NOT NULL,
  \`enabled\` integer DEFAULT true,
  \`note\` text,
  \`hit_count\` numeric DEFAULT 0,
  \`last_hit\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_redirects_from_path_idx` ON `eg_redirects` (`from_path`)',
  'CREATE INDEX IF NOT EXISTS `eg_redirects_created_at_idx` ON `eg_redirects` (`created_at`)',
]

type Runner = MigrateUpArgs['db']

/**
 * Adds a column, treating "it is already there" as success.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and this migration has to be safe
 * to replay - production runs it through an HTTP endpoint that can be called
 * twice. Only the duplicate-column error is swallowed; anything else still
 * fails the migration, because a silently skipped schema change is how a table
 * ends up half-built with nobody knowing.
 */
const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(REDIRECTS))
  for (const statement of INDEXES) {
    await db.run(sql.raw(statement))
  }

  // Every registered collection needs a column here or the admin's document
  // locking fails on the first edit - the join table is one wide row of
  // per-collection foreign keys and the engine writes to whichever one matches.
  await addColumn(db, 'eg_locked_documents_rels', 'eg_redirects_id', 'integer')
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_redirects_id_idx` ON `eg_locked_documents_rels` (`eg_redirects_id`)',
    ),
  )

  engine.logger.info('[migrate] eg_redirects table created.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here.
  engine.logger.info('[migrate] Down is a no-op - the redirects table is left in place.')
}
