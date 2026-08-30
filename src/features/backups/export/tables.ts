/**
 * Which tables belong to which part of a backup.
 *
 * The set is discovered from `sqlite_master` at run time rather than written
 * out by hand, because the engine generates a family of tables per collection -
 * `<table>_rels`, `_<table>_v` for versions, `<table>_locales`, and one
 * `<table>_blocks_<block>` per block type - and that family changes every time a
 * block is added. A hand-kept list would silently stop covering new tables,
 * which is the kind of omission you discover during a restore.
 *
 * App tables carry the `eg_` prefix. Version tables carry a leading underscore
 * as well (`_eg_pages_v`), which is why the pattern allows one.
 */

const APP_TABLE = /^_?eg_/

/**
 * The bases behind every Settings screen. Everything under Settings goes into
 * the "settings" part of a backup instead of the "database" part, so the two
 * content toggles mean what the screen says they mean.
 *
 * Classification takes the LONGEST matching base, otherwise `eg_media_settings`
 * would be swallowed by a prefix match on `eg_media` and end up filed as
 * content.
 */
const SETTINGS_BASES = [
  'eg_backup_settings',
  'eg_blog_settings',
  'eg_email_settings',
  'eg_faq_settings',
  'eg_footer',
  'eg_form_settings',
  'eg_header',
  'eg_integrations',
  'eg_language_settings',
  'eg_media_settings',
  'eg_member_settings',
  'eg_navigation',
  'eg_payment_settings',
  'eg_security_settings',
  'eg_seo_settings',
  'eg_shop_settings',
  'eg_site_settings',
  'eg_speed_settings',
]

/**
 * Tables that are deliberately never captured.
 *
 * These hold per-isolate or per-session state that is meaningless once restored
 * somewhere else, and restoring them does active harm: stale document locks
 * would leave every page checked out to a user who has long since gone, and a
 * restored session table would resurrect sessions that were signed out. The
 * migration history is NOT in this list - the schema version a backup was taken
 * at is exactly what a restore needs to know.
 */
const NEVER_BACKED_UP = new Set([
  'eg_kv',
  'eg_locked_documents',
  'eg_locked_documents_rels',
  'eg_preferences',
  'eg_preferences_rels',
  'eg_users_sessions',
])

export type TableSplit = {
  /** Content, users, orders - everything the Database toggle covers. */
  database: string[]
  /** The Settings screens' own tables. */
  settings: string[]
}

/** Longest-base-wins classification, so nested settings tables land correctly. */
const ownedBySettings = (table: string): boolean =>
  SETTINGS_BASES.some((base) => table === base || table.startsWith(`${base}_`))

export async function listAppTables(db: D1Database): Promise<TableSplit> {
  const result = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all()

  const split: TableSplit = { database: [], settings: [] }

  for (const row of (result.results ?? []) as { name: string }[]) {
    const table = row.name
    if (!APP_TABLE.test(table)) continue
    if (NEVER_BACKED_UP.has(table)) continue
    if (ownedBySettings(table)) split.settings.push(table)
    else split.database.push(table)
  }

  return split
}

/** Column names in declaration order, which is the order rows are written in. */
export async function columnsOf(db: D1Database, table: string): Promise<string[]> {
  const result = await db.prepare(`PRAGMA table_info(\`${table}\`)`).all()
  return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
}

export { APP_TABLE, NEVER_BACKED_UP, SETTINGS_BASES }
