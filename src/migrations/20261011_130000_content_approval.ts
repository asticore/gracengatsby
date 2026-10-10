import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Content approval: a review state on each drafts collection, the review history table, and the
// per-collection approval rules on the Security settings global.
//
// Written by hand (not generated) for the same reason the other migrations here are: production
// runs these through an HTTP endpoint that may be called twice, so every statement is safe to
// replay. Table-exists and column-exists checks cover everything; a table that is not there yet
// (a collection from an optional feature) is skipped, not failed.
//
// Column names are what src/cms/db/schema/generate.ts produces for the fields in
// src/features/approval/fields.ts and the approval group in src/globals/SecuritySettings.ts.
// Change one, change both.

type Runner = MigrateUpArgs['db']

/** The drafts collections that carry review fields, by live table. Version tables are `_<table>_v`. */
const REVIEWED_TABLES = ['eg_pages', 'eg_posts', 'eg_events', 'eg_courses', 'eg_products'] as const

const REVIEW_EVENTS = `CREATE TABLE IF NOT EXISTS \`eg_review_events\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`collection\` text NOT NULL,
  \`doc_id\` numeric NOT NULL,
  \`doc_title\` text,
  \`action\` text NOT NULL,
  \`note\` text,
  \`actor_id\` integer,
  \`actor_name\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

const REVIEW_EVENTS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_review_events_collection_doc_id_idx` ON `eg_review_events` (`collection`, `doc_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_review_events_action_created_at_idx` ON `eg_review_events` (`action`, `created_at`)',
]

const SECURITY_APPROVAL_COLUMNS: Array<[string, string]> = [
  ['approval_enabled', 'integer DEFAULT false'],
  ['approval_pages_approvals', 'numeric DEFAULT 0'],
  ['approval_posts_approvals', 'numeric DEFAULT 0'],
  ['approval_events_approvals', 'numeric DEFAULT 0'],
  ['approval_courses_approvals', 'numeric DEFAULT 0'],
  ['approval_products_approvals', 'numeric DEFAULT 0'],
  ['approval_allow_self_approval', 'integer DEFAULT false'],
  ['approval_admins_may_self_approve', 'integer DEFAULT true'],
  ['approval_notify_reviewers', 'integer DEFAULT true'],
  ['approval_notify_emails', 'text'],
]

/** Columns on the live table and, with the `version_` prefix, on its versions table. */
const REVIEW_COLUMNS: Array<[string, string]> = [
  ['review_status', "text DEFAULT 'none'"],
  ['review_requested_by_id', 'integer'],
  ['review_requested_at', 'text'],
  ['review_approvals', 'text'],
]

const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return rows.length > 0
}

const columnNames = async (db: Runner, table: string): Promise<Set<string>> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

/** Adds each column that is not already there. Table must exist - callers check first. */
const addMissingColumns = async (db: Runner, table: string, columns: Array<[string, string]>): Promise<void> => {
  const existing = await columnNames(db, table)
  for (const [column, type] of columns) {
    if (!existing.has(column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const live of REVIEWED_TABLES) {
    if (await tableExists(db, live)) {
      await addMissingColumns(db, live, REVIEW_COLUMNS)
    }
    const versions = `_${live}_v`
    if (await tableExists(db, versions)) {
      await addMissingColumns(
        db,
        versions,
        REVIEW_COLUMNS.map(([column, type]) => [`version_${column}`, type] as [string, string]),
      )
    }
  }

  await db.run(sql.raw(REVIEW_EVENTS))
  for (const statement of REVIEW_EVENTS_INDEXES) {
    await db.run(sql.raw(statement))
  }

  // Document locking needs a column per registered collection (see the redirects migration).
  if (await tableExists(db, 'eg_locked_documents_rels')) {
    await addMissingColumns(db, 'eg_locked_documents_rels', [['eg_review_events_id', 'integer']])
    await db.run(
      sql.raw(
        'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_review_events_id_idx` ON `eg_locked_documents_rels` (`eg_review_events_id`)',
      ),
    )
  }

  // The feature toggle for this feature (see the approval entry in src/features/registry.ts).
  if (await tableExists(db, 'eg_site_settings')) {
    await addMissingColumns(db, 'eg_site_settings', [['features_approval', 'integer DEFAULT false']])
  }

  if (await tableExists(db, 'eg_security_settings')) {
    await addMissingColumns(db, 'eg_security_settings', SECURITY_APPROVAL_COLUMNS)
  }

  engine.logger.info('[migrate] content approval columns and eg_review_events table ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply and the review history is worth keeping, so down is a no-op.
}
