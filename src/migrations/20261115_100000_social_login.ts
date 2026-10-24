import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Social login (Google, GitHub, Apple, Facebook, Microsoft, Discord).
//   1. The `socialLogin` group on the Security settings global: per provider a switch
//      (off), client id and encrypted secret, plus Apple's team/key/private key and
//      Microsoft's tenant. Column names follow the generator: social_login_<field>.
//      Mirror: src/globals/socialLoginFields.ts. Nothing is switched on, so no
//      existing site changes behaviour.
//   2. `eg_social_accounts`, the linked provider identities. Mirror:
//      src/cms/db/schema/socialAccounts.ts. Change one, change the other.
// Idempotent: tables and columns that already exist are left alone.

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

export const SECURITY_SETTINGS_SOCIAL_LOGIN_COLUMNS: Array<[column: string, type: string]> = [
  ['social_login_allow_signup_via_social', 'integer DEFAULT 1'],
  ['social_login_allow_admin_social_login', 'integer DEFAULT 0'],
  ['social_login_google_enabled', 'integer DEFAULT 0'],
  ['social_login_google_client_id', 'text'],
  ['social_login_google_client_secret', 'text'],
  ['social_login_google_redirect_confirmed', 'integer DEFAULT 0'],
  ['social_login_github_enabled', 'integer DEFAULT 0'],
  ['social_login_github_client_id', 'text'],
  ['social_login_github_client_secret', 'text'],
  ['social_login_github_redirect_confirmed', 'integer DEFAULT 0'],
  ['social_login_apple_enabled', 'integer DEFAULT 0'],
  ['social_login_apple_client_id', 'text'],
  ['social_login_apple_team_id', 'text'],
  ['social_login_apple_key_id', 'text'],
  ['social_login_apple_private_key', 'text'],
  ['social_login_apple_redirect_confirmed', 'integer DEFAULT 0'],
  ['social_login_facebook_enabled', 'integer DEFAULT 0'],
  ['social_login_facebook_client_id', 'text'],
  ['social_login_facebook_client_secret', 'text'],
  ['social_login_facebook_redirect_confirmed', 'integer DEFAULT 0'],
  ['social_login_microsoft_enabled', 'integer DEFAULT 0'],
  ['social_login_microsoft_client_id', 'text'],
  ['social_login_microsoft_client_secret', 'text'],
  ['social_login_microsoft_tenant', "text DEFAULT 'common'"],
  ['social_login_microsoft_redirect_confirmed', 'integer DEFAULT 0'],
  ['social_login_discord_enabled', 'integer DEFAULT 0'],
  ['social_login_discord_client_id', 'text'],
  ['social_login_discord_client_secret', 'text'],
  ['social_login_discord_redirect_confirmed', 'integer DEFAULT 0'],
]

const SOCIAL_ACCOUNTS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_social_accounts\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`user_id\` integer NOT NULL,
  \`provider\` text NOT NULL,
  \`provider_user_id\` text NOT NULL,
  \`email\` text,
  \`created_at\` text NOT NULL,
  \`last_login_at\` text
)`

const SOCIAL_ACCOUNTS_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_social_accounts_provider_user_idx` ON `eg_social_accounts` (`provider`, `provider_user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_social_accounts_user_id_idx` ON `eg_social_accounts` (`user_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_SOCIAL_LOGIN_COLUMNS)
  await db.run(sql.raw(SOCIAL_ACCOUNTS_TABLE))
  for (const statement of SOCIAL_ACCOUNTS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Social login columns and eg_social_accounts are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and the table are left in place.
  engine.logger.info('[migrate] Down is a no-op - social login columns and table are left in place.')
}
