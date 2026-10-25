import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Shared password groups and "signed-in accounts" visibility.
//   1. `eg_password_groups`: a named shared password (PBKDF2 hash only) with an optional expiry and an
//      optional cap on successful unlocks (max_uses / use_count). Many documents can reference one group.
//   2. `eg_content_access`: one row per document that uses a group or an accounts rule instead of a
//      per-document password. mode 'group' needs group_id; mode 'accounts' lists allowed roles and membership
//      tier slugs as JSON text (both empty = any signed-in account) and may also carry a group_id as the
//      password fallback offered on the gate.
//   3. One flat field on the Security global (`eg_security_settings`): password_groups_enabled (1).
//      Mirror: passwordGroupsEnabled in src/globals/SecuritySettings.ts. Change one, change the other.
// Mirrors: src/cms/db/schema/passwordGroups.ts. Idempotent: anything already there is left alone.
// Registered last in src/migrations/index.ts.

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

export const SECURITY_SETTINGS_PASSWORD_GROUP_COLUMNS: Array<[column: string, type: string]> = [
  ['password_groups_enabled', 'integer DEFAULT 1'],
]

export const PASSWORD_GROUPS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_password_groups\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`name\` text NOT NULL,
  \`hash\` text NOT NULL,
  \`expires_at\` text,
  \`max_uses\` integer,
  \`use_count\` integer DEFAULT 0 NOT NULL,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`

export const CONTENT_ACCESS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_content_access\` (
  \`collection\` text NOT NULL,
  \`doc_id\` integer NOT NULL,
  \`mode\` text NOT NULL,
  \`group_id\` integer,
  \`roles\` text,
  \`tiers\` text,
  \`updated_at\` text NOT NULL,
  PRIMARY KEY (\`collection\`, \`doc_id\`)
)`

export const PASSWORD_GROUP_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_password_groups_name_idx` ON `eg_password_groups` (`name`)',
  'CREATE INDEX IF NOT EXISTS `eg_content_access_group_idx` ON `eg_content_access` (`group_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_PASSWORD_GROUP_COLUMNS)
  await db.run(sql.raw(PASSWORD_GROUPS_TABLE))
  await db.run(sql.raw(CONTENT_ACCESS_TABLE))
  for (const statement of PASSWORD_GROUP_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Password group tables and the password_groups_enabled column are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and tables are left in place.
  engine.logger.info('[migrate] Down is a no-op - password group tables and column are left in place.')
}
