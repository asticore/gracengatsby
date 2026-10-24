import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Customer organisations (src/features/organizations).
//   1. Three flat fields on the Security global (`eg_security_settings`), safe by default:
//      organizations_enabled (0), organizations_max_per_account (5),
//      organizations_who_may_create ('anyone'). Mirror: the organizations* fields in
//      src/globals/SecuritySettings.ts. Change one, change the other.
//   2. `eg_organizations`, `eg_organization_members`, `eg_organization_roles` (custom role names),
//      `eg_organization_teams`, `eg_organization_team_members`, `eg_organization_invitations`
//      (only a SHA-256 of the invitation token is stored). Mirror: src/cms/db/schema/organizations.ts.
//   3. `eg_content_org_visibility`: which organisation may see a protected document.
// Idempotent: a column, table or index that is already there is left alone. Registered last
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

export const SECURITY_SETTINGS_ORGANIZATION_COLUMNS: Array<[column: string, type: string]> = [
  ['organizations_enabled', 'integer DEFAULT 0'],
  ['organizations_max_per_account', 'integer DEFAULT 5'],
  ['organizations_who_may_create', "text DEFAULT 'anyone'"],
]

export const ORGANIZATION_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS \`eg_organizations\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`slug\` text NOT NULL,
  \`logo\` text,
  \`metadata\` text,
  \`created_by\` integer NOT NULL,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_organization_members\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`organization_id\` text NOT NULL,
  \`user_id\` integer NOT NULL,
  \`role\` text NOT NULL,
  \`created_at\` text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_organization_roles\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`organization_id\` text NOT NULL,
  \`name\` text NOT NULL,
  \`permissions\` text NOT NULL,
  \`created_at\` text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_organization_teams\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`organization_id\` text NOT NULL,
  \`name\` text NOT NULL,
  \`created_at\` text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_organization_team_members\` (
  \`team_id\` text NOT NULL,
  \`user_id\` integer NOT NULL,
  \`created_at\` text NOT NULL,
  PRIMARY KEY (\`team_id\`, \`user_id\`)
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_organization_invitations\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`organization_id\` text NOT NULL,
  \`email\` text NOT NULL,
  \`role\` text NOT NULL,
  \`team_id\` text,
  \`token_hash\` text NOT NULL,
  \`status\` text DEFAULT 'pending' NOT NULL,
  \`inviter_id\` integer NOT NULL,
  \`expires_at\` text NOT NULL,
  \`created_at\` text NOT NULL,
  \`resolved_at\` text,
  \`last_sent_at\` text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_content_org_visibility\` (
  \`collection\` text NOT NULL,
  \`doc_id\` integer NOT NULL,
  \`organization_id\` text NOT NULL,
  \`updated_at\` text NOT NULL,
  PRIMARY KEY (\`collection\`, \`doc_id\`)
)`,
]

export const ORGANIZATION_INDEXES: string[] = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_organizations_slug_idx` ON `eg_organizations` (`slug`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_organization_members_unique_idx` ON `eg_organization_members` (`organization_id`, `user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_organization_members_user_idx` ON `eg_organization_members` (`user_id`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_organization_roles_unique_idx` ON `eg_organization_roles` (`organization_id`, `name`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_organization_teams_unique_idx` ON `eg_organization_teams` (`organization_id`, `name`)',
  'CREATE INDEX IF NOT EXISTS `eg_organization_team_members_user_idx` ON `eg_organization_team_members` (`user_id`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_organization_invitations_token_idx` ON `eg_organization_invitations` (`token_hash`)',
  'CREATE INDEX IF NOT EXISTS `eg_organization_invitations_org_idx` ON `eg_organization_invitations` (`organization_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_organization_invitations_email_idx` ON `eg_organization_invitations` (`email`)',
  'CREATE INDEX IF NOT EXISTS `eg_content_org_visibility_org_idx` ON `eg_content_org_visibility` (`organization_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_ORGANIZATION_COLUMNS)
  for (const statement of ORGANIZATION_TABLES) {
    await db.run(sql.raw(statement))
  }
  for (const statement of ORGANIZATION_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Organisation columns and tables are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and tables are left in place.
  engine.logger.info('[migrate] Down is a no-op - organisation columns and tables are left in place.')
}
