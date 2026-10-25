import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Shared passwords and member login for password-protected content.
//   1. `eg_password_groups`: a named group with one hashed password (same PBKDF2 format as
//      eg_content_passwords). One password unlocks every item that references the group.
//      Mirror: src/cms/db/schema/passwordGroups.ts.
//   2. Three nullable columns on `eg_content_passwords` (the per-item protection row):
//      group_id (the shared group, or NULL for an item's own password), unlock_roles and
//      unlock_tiers (JSON arrays: a signed-in user with one of these roles, or on one of these
//      membership tiers, may open the item without typing the password). All NULL by default,
//      so existing protected items behave exactly as before.
// Idempotent: a table, column or index that is already there is left alone. Registered last
// in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const columnsOf = async (db: Runner, table: string): Promise<string[]> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.map((r) => r.name)
  } catch {
    return []
  }
}

const addColumns = async (db: Runner, table: string, columns: Array<[string, string]>): Promise<void> => {
  const existing = await columnsOf(db, table)
  if (existing.length === 0) return // table not present
  for (const [column, type] of columns) {
    if (existing.includes(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  }
}

export const CONTENT_PASSWORD_COLUMNS: Array<[column: string, type: string]> = [
  ['group_id', 'integer'],
  ['unlock_roles', 'text'],
  ['unlock_tiers', 'text'],
]

export const PASSWORD_GROUPS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_password_groups\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`name\` text NOT NULL,
  \`hash\` text NOT NULL,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`

export const PASSWORD_GROUPS_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_password_groups_name_idx` ON `eg_password_groups` (`name`)',
  'CREATE INDEX IF NOT EXISTS `eg_content_passwords_group_idx` ON `eg_content_passwords` (`group_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(PASSWORD_GROUPS_TABLE))
  await addColumns(db, 'eg_content_passwords', CONTENT_PASSWORD_COLUMNS)
  for (const statement of PASSWORD_GROUPS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_password_groups and eg_content_passwords unlock columns are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: table and columns are left in place.
  engine.logger.info('[migrate] Down is a no-op - password group table and columns are left in place.')
}
