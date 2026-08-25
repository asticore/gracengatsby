import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

import { renameTables } from './schema/applyRenames'
import { TABLE_RENAMES } from './schema/tableRenames'

// Renames every application table to the `eg_` (Engage) prefix, retiring both
// the unprefixed names and the ten `ac_` ones. Child tables come along by name:
// `pages_blocks_hero` -> `eg_pages_blocks_hero`, `_posts_v_rels` ->
// `_eg_posts_v_rels`, and so on. The mapping itself is generated - see
// ./schema/tableRenames.ts and scripts/generateTableRenames.mts.
//
// Deliberately NOT renamed: payload_migrations, payload_preferences,
// payload_preferences_rels, payload_locked_documents,
// payload_locked_documents_rels and payload_kv. Those are the engine's own
// bookkeeping - renaming them breaks migration tracking and admin state.
// Cloudflare's _cf_METADATA is left alone for the same reason.
//
// Idempotent by construction, because this also runs on every deploy through
// /api/internal-migrate: SQLite has no `ALTER TABLE ... RENAME IF EXISTS`, so
// each pair is checked against sqlite_master first and skipped unless the old
// table is still there and the new one is not. That makes a second pass a
// no-op, and makes a half-applied run safe to resume.
//
// Indexes: SQLite carries a table's indexes across `ALTER TABLE ... RENAME TO`
// automatically, but the index NAMES keep their old text (`pages_slug_idx`
// stays `pages_slug_idx` on `eg_pages`). That is cosmetic - the indexes still
// cover the right columns on the right table - and renaming them is not worth
// the extra churn, so it is left as is.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await renameTables({
    renames: TABLE_RENAMES,
    exists: async (table) => {
      const rows = (await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
      )) as { name: string }[]
      return rows.length > 0
    },
    rename: async (from, to) => {
      await db.run(sql.raw(`ALTER TABLE \`${from}\` RENAME TO \`${to}\``))
    },
  })
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // Intentionally a no-op, matching the other migrations here. Renaming every
  // table back would leave the running config - which now asks for `eg_`
  // tables - pointing at names that no longer exist, so a rollback would break
  // the site rather than repair it.
  engine.logger.info('[migrate] Down is a no-op - the eg_ table names are left in place.')
}
