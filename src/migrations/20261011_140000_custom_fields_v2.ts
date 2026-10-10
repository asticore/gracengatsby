import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Check if a column exists in a table.
 */
const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

/**
 * Custom fields v2.
 *
 * - eg_field_groups.definition: the builder's list of fields (JSON text). Groups
 *   created before this keep working: the legacy eg_field_groups_fields rows are
 *   read when `definition` is empty (src/features/customFields/normalize.ts).
 * - eg_field_groups.location: where a group applies (JSON text). Empty means the
 *   legacy targetCollections quick rule.
 * - eg_custom_field_options: values for Options pages - one row per page slug,
 *   values as a JSON object. Not a collection, so it has no engine config.
 *
 * Idempotent: columns are checked with PRAGMA table_info, the table is created
 * with IF NOT EXISTS.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (!(await columnExists(db, 'eg_field_groups', 'definition'))) {
    await db.run(sql.raw(`ALTER TABLE \`eg_field_groups\` ADD COLUMN \`definition\` TEXT`))
  }
  if (!(await columnExists(db, 'eg_field_groups', 'location'))) {
    await db.run(sql.raw(`ALTER TABLE \`eg_field_groups\` ADD COLUMN \`location\` TEXT`))
  }
  await db.run(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS \`eg_custom_field_options\` (\`slug\` TEXT PRIMARY KEY NOT NULL, \`values\` TEXT NOT NULL DEFAULT '{}', \`updated_at\` TEXT NOT NULL)`,
    ),
  )
}

export async function down(): Promise<void> {
  // SQLite cannot drop columns cheaply; the new columns are harmless when unused.
}
