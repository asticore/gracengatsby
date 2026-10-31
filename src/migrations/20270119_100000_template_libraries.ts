import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Template libraries: the `template-libraries` global (src/features/templateLibraries/settings.ts).
 * Creates eg_template_libraries, its `libraries` child table (the GitHub folders added by address)
 * and its `imports` child table (one record per picture saved to the media gallery, keyed by SHA-256).
 *
 * Existing template repositories (Integrations > Template repositories, eg_integrations_template_repos_repos)
 * are copied across once, as GitHub addresses, so nothing configured before goes missing. The copy only
 * runs while the new list is empty, and only when the old master switch was on (otherwise the copied
 * rows are switched off, which keeps the old behaviour).
 *
 * Everything is replayable: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, INSERT OR IGNORE.
 * Column names are what src/cms/db/schema/generate.ts produces for the global. Change one, change both.
 */

const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as { name: string }[]
  return rows.length > 0
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS \`eg_template_libraries\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`updated_at\` text DEFAULT (${NOW}) NOT NULL,
    \`created_at\` text DEFAULT (${NOW}) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`eg_template_libraries_libraries\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`url\` text NOT NULL,
    \`enabled\` integer DEFAULT true,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_template_libraries\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS \`eg_template_libraries_imports\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`sha256\` text,
    \`media_id\` numeric,
    \`source_url\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_template_libraries\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`,
]

const INDEXES: string[] = [
  'CREATE INDEX IF NOT EXISTS `eg_template_libraries_libraries_order_idx` ON `eg_template_libraries_libraries` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_template_libraries_libraries_parent_id_idx` ON `eg_template_libraries_libraries` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_template_libraries_imports_order_idx` ON `eg_template_libraries_imports` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_template_libraries_imports_parent_id_idx` ON `eg_template_libraries_imports` (`_parent_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const statement of INDEXES) await db.run(sql.raw(statement))

  // The single global row. INSERT OR IGNORE keeps an existing row as it is.
  await db.run(sql.raw(`INSERT OR IGNORE INTO \`eg_template_libraries\` (\`id\`, \`updated_at\`, \`created_at\`) VALUES (1, ${NOW}, ${NOW})`))

  const legacyExists = await tableExists(db, 'eg_integrations_template_repos_repos')
  const listEmpty = ((await db.all(sql`SELECT COUNT(*) AS n FROM eg_template_libraries_libraries`)) as { n: number }[])[0]?.n === 0
  if (legacyExists && listEmpty) {
    await db.run(sql.raw(`INSERT INTO \`eg_template_libraries_libraries\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`, \`url\`, \`enabled\`)
      SELECT r.\`_order\`, 1, r.\`id\`, COALESCE(r.\`label\`, ''),
        'https://github.com/' || r.\`owner\` || '/' || r.\`repo\` ||
          CASE
            WHEN COALESCE(r.\`path\`, '') <> '' THEN '/tree/' || COALESCE(NULLIF(r.\`branch\`, ''), 'main') || '/' || r.\`path\`
            WHEN COALESCE(NULLIF(r.\`branch\`, ''), 'main') <> 'main' THEN '/tree/' || r.\`branch\`
            ELSE ''
          END,
        CASE WHEN (SELECT COALESCE(MAX(i.\`template_repos_enabled\`), 0) FROM \`eg_integrations\` i) = 1 THEN COALESCE(r.\`enabled\`, 1) ELSE 0 END
      FROM \`eg_integrations_template_repos_repos\` r
      WHERE COALESCE(r.\`owner\`, '') <> '' AND COALESCE(r.\`repo\`, '') <> ''`))
    engine.logger.info('[migrate] Template repositories copied to template libraries.')
  }
  engine.logger.info('[migrate] Template libraries tables are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here: the libraries an operator added cannot be rebuilt.
  engine.logger.info('[migrate] Down is a no-op - template library tables are left in place.')
}
