import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Approval workflows: named multi-step review flows per content type (see
// src/features/approval/workflows.ts).
//
//   - eg_approval_workflows and its `steps` array child table (eg_approval_workflows_steps),
//     in the shape src/cms/db/schema/generate.ts produces for src/features/approval/workflowCollection.ts
//   - review_step on each reviewed table and version_review_step on its versions table: the
//     workflow step a document in review is waiting at (src/features/approval/fields.ts)
//   - step on eg_review_events: which step a history row belongs to
//   - the document-lock join column for the new collection
//
// Written by hand like the other migrations here: every statement is safe to replay (production
// runs these through an HTTP endpoint that may be called twice), and a table that does not exist
// yet (a collection from an optional feature) is skipped, not failed.

type Runner = MigrateUpArgs['db']

const REVIEWED_TABLES = ['eg_pages', 'eg_posts', 'eg_events', 'eg_courses', 'eg_products'] as const

const WORKFLOWS = `CREATE TABLE IF NOT EXISTS \`eg_approval_workflows\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`collection\` text NOT NULL,
  \`active\` integer DEFAULT false,
  \`submitter_roles\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

const WORKFLOW_STEPS = `CREATE TABLE IF NOT EXISTS \`eg_approval_workflows_steps\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`approver_roles\` text,
  \`approvals_needed\` numeric DEFAULT 1 NOT NULL,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_approval_workflows\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_approval_workflows_collection_active_idx` ON `eg_approval_workflows` (`collection`, `active`)',
  'CREATE INDEX IF NOT EXISTS `eg_approval_workflows_steps_order_idx` ON `eg_approval_workflows_steps` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_approval_workflows_steps_parent_id_idx` ON `eg_approval_workflows_steps` (`_parent_id`)',
]

const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return rows.length > 0
}

const columnNames = async (db: Runner, table: string): Promise<Set<string>> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

/** Adds each column that is not already there. The table must exist: callers check first. */
const addMissingColumns = async (db: Runner, table: string, columns: Array<[string, string]>): Promise<void> => {
  const existing = await columnNames(db, table)
  for (const [column, type] of columns) {
    if (!existing.has(column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(WORKFLOWS))
  await db.run(sql.raw(WORKFLOW_STEPS))
  for (const statement of INDEXES) {
    await db.run(sql.raw(statement))
  }

  for (const live of REVIEWED_TABLES) {
    if (await tableExists(db, live)) {
      await addMissingColumns(db, live, [['review_step', 'numeric DEFAULT 0']])
    }
    const versions = `_${live}_v`
    if (await tableExists(db, versions)) {
      await addMissingColumns(db, versions, [['version_review_step', 'numeric DEFAULT 0']])
    }
  }

  // Created by the content approval migration; the step a history row belongs to is new.
  if (await tableExists(db, 'eg_review_events')) {
    await addMissingColumns(db, 'eg_review_events', [['step', 'text']])
  }

  // Document locking needs a column per registered collection (see the redirects migration).
  if (await tableExists(db, 'eg_locked_documents_rels')) {
    await addMissingColumns(db, 'eg_locked_documents_rels', [['eg_approval_workflows_id', 'integer']])
    await db.run(
      sql.raw(
        'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_approval_workflows_id_idx` ON `eg_locked_documents_rels` (`eg_approval_workflows_id`)',
      ),
    )
  }

  engine.logger.info('[migrate] approval workflow tables and review step columns ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply and workflows are configuration worth keeping, so down is a no-op.
}
