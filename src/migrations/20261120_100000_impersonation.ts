import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Admin impersonation ("sign in as customer") with a full audit trail.
//   1. Three flat fields on the Security global (`eg_security_settings`), all safe by default:
//      impersonation_enabled (0), impersonation_max_minutes (30; clamped to 5..120 when read),
//      impersonation_require2fa (1). Mirror: the impersonation fields in src/globals/SecuritySettings.ts.
//      Change one, change the other.
//   2. `eg_impersonations`, one row per impersonation started: who (admin), whom (customer), why,
//      when, when it ended, the device session it opened (session_id, revoked on stop), and the
//      request's coarse address and agent. Mirror:
//      src/cms/db/schema/impersonations.ts.
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

export const SECURITY_SETTINGS_IMPERSONATION_COLUMNS: Array<[column: string, type: string]> = [
  ['impersonation_enabled', 'integer DEFAULT 0'],
  ['impersonation_max_minutes', 'integer DEFAULT 30'],
  ['impersonation_require2fa', 'integer DEFAULT 1'],
]

export const IMPERSONATIONS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_impersonations\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`admin_id\` integer NOT NULL,
  \`admin_email\` text NOT NULL,
  \`target_user_id\` integer NOT NULL,
  \`target_email\` text NOT NULL,
  \`reason\` text NOT NULL,
  \`started_at\` text NOT NULL,
  \`ended_at\` text,
  \`expires_at\` text NOT NULL,
  \`ip\` text,
  \`user_agent\` text,
  \`session_id\` text
)`

export const IMPERSONATIONS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_impersonations_admin_idx` ON `eg_impersonations` (`admin_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_impersonations_target_idx` ON `eg_impersonations` (`target_user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_impersonations_started_idx` ON `eg_impersonations` (`started_at`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_IMPERSONATION_COLUMNS)
  await db.run(sql.raw(IMPERSONATIONS_TABLE))
  for (const statement of IMPERSONATIONS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Impersonation columns and eg_impersonations are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and the table are left in place.
  engine.logger.info('[migrate] Down is a no-op - impersonation columns and table are left in place.')
}
