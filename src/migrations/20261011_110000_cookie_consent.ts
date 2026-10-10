import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Cookie consent: the `consent` group on the Integrations global and its
 * "Cookies in use" child table. Column names are the ones generateTable
 * produces for the group (`consent_` prefix, snake_case), so the drizzle
 * schema and this migration agree.
 *
 * Deliberately no DDL default on `consent_mode`. A NULL there lets the code
 * fall back to the older `analytics.requireCookieConsent` flag, so a site that
 * turned that flag off keeps loading tags straight away after this runs.
 *
 * Idempotent: columns and tables are only added when missing.
 */

const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
  )) as { name: string }[]
  return rows.length > 0
}

const CONSENT_COLUMNS: Array<[column: string, type: string]> = [
  ['consent_enabled', 'integer DEFAULT 1'],
  ['consent_mode', 'text'],
  ['consent_policy_version', 'numeric DEFAULT 1'],
  ['consent_banner_title', 'text'],
  ['consent_banner_text', 'text'],
  ['consent_accept_label', 'text'],
  ['consent_reject_label', 'text'],
  ['consent_customise_label', 'text'],
  ['consent_save_label', 'text'],
  ['consent_position', `text DEFAULT 'bottom'`],
  ['consent_theme', `text DEFAULT 'auto'`],
  ['consent_banner_background', 'text'],
  ['consent_banner_text_color', 'text'],
  ['consent_button_color', 'text'],
  ['consent_privacy_policy_url', 'text'],
  ['consent_cookie_settings_label', 'text'],
  ['consent_geo_logging', 'integer'],
  ['consent_log_consent', 'integer DEFAULT 1'],
  ['consent_consent_mode_v2', 'integer DEFAULT 1'],
  ['consent_head_script_category', `text DEFAULT 'analytics'`],
  ['consent_body_script_category', `text DEFAULT 'analytics'`],
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (!(await tableExists(db, 'eg_integrations'))) return

  for (const [column, type] of CONSENT_COLUMNS) {
    await addColumn(db, 'eg_integrations', column, type)
  }

  // "Cookies in use": a hasMany array inside the consent group. Same shape as
  // eg_integrations_custom_keys - a text id, plus the parent link and order.
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`eg_integrations_consent_cookie_list\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`category\` text,
    \`name\` text,
    \`provider\` text,
    \`purpose\` text,
    \`duration\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_integrations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`))
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `eg_integrations_consent_cookie_list_order_idx` ON `eg_integrations_consent_cookie_list` (`_order`)',
    ),
  )
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `eg_integrations_consent_cookie_list_parent_id_idx` ON `eg_integrations_consent_cookie_list` (`_parent_id`)',
    ),
  )
}

export async function down(): Promise<void> {
  // No-op, matching the other migrations here: consent choices and the cookie
  // list are configuration an operator wrote and cannot be rebuilt.
}
