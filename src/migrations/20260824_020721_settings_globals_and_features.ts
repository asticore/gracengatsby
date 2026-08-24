import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import { applySchemaAdditions } from './schema/applySchema'
import { SETTINGS_COLUMNS, SETTINGS_INDEXES, SETTINGS_TABLES } from './schema/settingsSchema'

// Schema for the settings globals (SEO, Speed, Media, Email, Backups, Members,
// Security, Languages, Payments, Forms) and the feature-toggle framework.
//
// As with the page-builder migration, the CLI's `migrate:create` emits a full
// schema dump rather than a diff on this project, so what runs here is the
// computed difference against the live schema: 15 new tables, 10 new columns
// on site_settings, 12 new indexes, nothing dropped. See
// ./20260822_234701_builder_sections_loops_custom_fields.ts for the procedure
// used to regenerate ./schema/settingsSchema.ts.
//
// The new tables carry an `ac_` prefix because every new global sets `dbName`
// explicitly. Older tables predate that convention and are renamed by a
// separate migration, so both spellings coexist until then.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await applySchemaAdditions({
    tables: SETTINGS_TABLES,
    columns: SETTINGS_COLUMNS,
    indexes: SETTINGS_INDEXES,
    run: async (statement) => {
      await db.run(sql.raw(statement))
    },
    columnsOf: async (table) => {
      const info = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
      return info.map((row) => row.name)
    },
  })
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // Intentionally a no-op. Rolling this back would drop every settings global
  // and the feature flags that decide which parts of the site are switched on.
  engine.logger.info('[migrate] Down is a no-op - settings schema is left in place.')
}
