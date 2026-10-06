import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

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
 * Add permission_overrides text column to eg_users for per-user permission grants/denies.
 * Idempotent: checks column exists before adding.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (!(await columnExists(db, 'eg_users', 'permission_overrides'))) {
    await db.run(sql.raw(`ALTER TABLE \`eg_users\` ADD COLUMN \`permission_overrides\` TEXT`))
  }
}

export async function down(): Promise<void> {
  // SQLite does not support DROP COLUMN, so we skip the down
  // In a production migration, you would need to recreate the table
}
