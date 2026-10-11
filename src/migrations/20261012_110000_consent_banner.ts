import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Cookie banner customisation: the extra columns on the `consent` group of the
 * Integrations global (show/hide Reject all, privacy link text, per-category
 * names and descriptions, accent colour, corner radius, text size, logo).
 * Column names are what generateTable produces (`consent_` + snake_case).
 *
 * Idempotent: a column that already exists is skipped. Runs after
 * 20261011_110000_cookie_consent, which creates the group's first columns, but
 * does not depend on it having run: with no table it does nothing.
 */

const NEW_COLUMNS: Array<[column: string, type: string]> = [
  ['consent_show_reject_button', 'integer DEFAULT 1'],
  ['consent_privacy_policy_label', 'text'],
  ['consent_necessary_label', 'text'],
  ['consent_necessary_description', 'text'],
  ['consent_preferences_label', 'text'],
  ['consent_preferences_description', 'text'],
  ['consent_analytics_label', 'text'],
  ['consent_analytics_description', 'text'],
  ['consent_marketing_label', 'text'],
  ['consent_marketing_description', 'text'],
  ['consent_accent_color', 'text'],
  ['consent_border_radius', 'numeric'],
  ['consent_font_size', 'numeric'],
  ['consent_show_logo', 'integer'],
  ['consent_logo_url', 'text'],
]

const tableColumns = async (db: Runner, table: string): Promise<Set<string>> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const existing = await tableColumns(db, 'eg_integrations')
  if (existing.size === 0) return

  for (const [column, type] of NEW_COLUMNS) {
    if (existing.has(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`eg_integrations\` ADD COLUMN \`${column}\` ${type}`))
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here: banner settings are
  // configuration an operator wrote and cannot be rebuilt.
}
