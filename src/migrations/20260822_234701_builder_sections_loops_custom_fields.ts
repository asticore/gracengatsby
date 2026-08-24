import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

import { applySchemaAdditions } from './schema/applySchema'
import { NEW_COLUMNS, NEW_INDEXES, NEW_TABLES } from './schema/builderSchema'

// Schema for the page-builder upgrade: the Section and Loop blocks, the shared
// per-block `design` settings, and Field Groups (portal-defined custom fields).
//
// `payload migrate:create` produced a full-schema dump here rather than a diff,
// because this project has no drizzle snapshot for its current state - running
// that verbatim against a database that already has these tables would fail.
// So the statements applied here are the computed *difference* between the
// schema Payload wants and the schema that already exists: 24 new tables, 90
// new columns and 79 new indexes, with nothing dropped or rewritten. They live
// in ./schema/builderSchema.ts and are shared with /api/internal-migrate, which
// is what actually applies them to production (see the note on the D1 binding
// in wrangler.jsonc for why `payload migrate` cannot reach real D1 from CI).
//
// Everything is idempotent: tables and indexes use IF NOT EXISTS, and each
// column add is guarded by a PRAGMA table_info check, since SQLite's
// ALTER TABLE ADD COLUMN has no IF NOT EXISTS form.
//
// To regenerate ./schema/builderSchema.ts after changing the config:
//   1. `payload migrate:create <name>` - emits a full-schema dump, not a diff.
//   2. Build a TARGET database: apply that dump's statements to an empty
//      SQLite file, first seeding any table the dump omits (it skips tables it
//      considers unchanged) from the current database's own DDL.
//   3. Diff TARGET against the current database (.wrangler's local D1 tracks
//      the same migration state as production): tables present only in target,
//      columns present only in target, indexes present only in target.
//   4. Emit those three lists, rewriting CREATE statements to IF NOT EXISTS.
//   5. Verify by applying the result twice to a copy of the current database -
//      the second pass must add nothing and the final schema must match target.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await applySchemaAdditions({
    tables: NEW_TABLES,
    columns: NEW_COLUMNS,
    indexes: NEW_INDEXES,
    run: async (statement) => {
      await db.run(sql.raw(statement))
    },
    columnsOf: async (table) => {
      const info = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
      return info.map((row) => row.name)
    },
  })
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Intentionally a no-op. Rolling this back would drop the tables and columns
  // holding every Section layout, Loop configuration and custom field value on
  // the site - far more destructive than leaving unused schema in place.
  payload.logger.info('[migrate] Down is a no-op - page-builder schema is left in place.')
}
