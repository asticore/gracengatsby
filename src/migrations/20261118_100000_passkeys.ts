import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Passkeys (WebAuthn) sign-in for customers and admins.
//   1. Four flat fields on the Security global (`eg_security_settings`), all off or default
//      by design: passkeys_enabled (0), passkeys_allow_admins (0), passkeys_rp_name (NULL,
//      meaning the site name), passkeys_user_verification ('preferred'). Mirror: the passkey
//      fields in src/globals/SecuritySettings.ts. Change one, change the other.
//   2. `eg_passkeys`, one row per registered credential. Only the public key is stored
//      (base64 of the COSE_Key bytes). Mirror: src/cms/db/schema/passkeys.ts.
// Idempotent: a column or table that is already there is left alone. Registered last
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

export const SECURITY_SETTINGS_PASSKEY_COLUMNS: Array<[column: string, type: string]> = [
  ['passkeys_enabled', 'integer DEFAULT 0'],
  ['passkeys_allow_admins', 'integer DEFAULT 0'],
  ['passkeys_rp_name', 'text'],
  ['passkeys_user_verification', "text DEFAULT 'preferred'"],
]

export const PASSKEYS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_passkeys\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`user_id\` integer NOT NULL,
  \`credential_id\` text NOT NULL,
  \`public_key\` text NOT NULL,
  \`sign_count\` integer DEFAULT 0 NOT NULL,
  \`transports\` text,
  \`device_label\` text,
  \`backed_up\` integer DEFAULT 0 NOT NULL,
  \`created_at\` text NOT NULL,
  \`last_used_at\` text
)`

export const PASSKEYS_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_passkeys_credential_idx` ON `eg_passkeys` (`credential_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_passkeys_user_idx` ON `eg_passkeys` (`user_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_PASSKEY_COLUMNS)
  await db.run(sql.raw(PASSKEYS_TABLE))
  for (const statement of PASSKEYS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Passkey columns and eg_passkeys are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and the table are left in place.
  engine.logger.info('[migrate] Down is a no-op - passkey columns and table are left in place.')
}
