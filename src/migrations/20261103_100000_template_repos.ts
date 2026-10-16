import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Template repositories: the `templateRepos` group on the Integrations global
 * (src/globals/Integrations.ts) and its "Repositories" child table. Column and
 * table names are what src/cms/db/schema/generate.ts produces for the group
 * (`template_repos_` prefix, snake_case). Change one, change both.
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
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as { name: string }[]
  return rows.length > 0
}

const COLUMNS: Array<[column: string, type: string]> = [
  ['template_repos_enabled', 'integer DEFAULT 0'],
  ['template_repos_token', 'text'],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  if (!(await tableExists(db, 'eg_integrations'))) return

  for (const [column, type] of COLUMNS) {
    await addColumn(db, 'eg_integrations', column, type)
  }

  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`eg_integrations_template_repos_repos\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text,
    \`owner\` text,
    \`repo\` text,
    \`branch\` text DEFAULT 'main',
    \`path\` text DEFAULT '',
    \`enabled\` integer DEFAULT 1,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_integrations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`))
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `eg_integrations_template_repos_repos_order_idx` ON `eg_integrations_template_repos_repos` (`_order`)',
    ),
  )
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `eg_integrations_template_repos_repos_parent_id_idx` ON `eg_integrations_template_repos_repos` (`_parent_id`)',
    ),
  )
  engine.logger.info('[migrate] Template repository settings are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here: the repository list and token are
  // configuration an operator wrote and cannot be rebuilt.
  engine.logger.info('[migrate] Down is a no-op - template repository columns and table are left in place.')
}
