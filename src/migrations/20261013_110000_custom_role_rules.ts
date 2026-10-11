import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Custom role rules: section / template locks.
//
//   - `locks` (JSON text) on eg_pages and eg_page_templates, `version_locks` on the pages versions table
//     (src/fields/locks.ts; names as src/cms/db/schema/generate.ts builds them)
//
// "Own items only" scope and the cached role matrix need no schema: scope lives inside the existing
// eg_roles.permissions JSON, and `createdBy` already exists on the scoped collections.
//
// Safe to replay: a column that is already there is skipped, and a table that does not exist yet is skipped.

type Runner = MigrateUpArgs['db']

const COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'eg_pages', column: 'locks' },
  { table: '_eg_pages_v', column: 'version_locks' },
  { table: 'eg_page_templates', column: 'locks' },
]

const columnNames = async (db: Runner, table: string): Promise<Set<string>> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { table, column } of COLUMNS) {
    const existing = await columnNames(db, table)
    if (existing.size === 0) continue // table not created (yet)
    if (!existing.has(column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` text`))
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply; the new columns are harmless when unused.
}
