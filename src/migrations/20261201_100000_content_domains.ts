import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// "Available on domains" (src/features/domains/field.ts) on pages, posts and products: one text column each,
// `available_domains`, and `version_available_domains` on the versioned copies. Idempotent: a column is added only
// when PRAGMA table_info says it is missing, and a table that is not there yet is skipped (its own migration creates
// it with the column already in the schema). Registered last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const TABLES: { table: string; column: string }[] = [
  { table: 'eg_pages', column: 'available_domains' },
  { table: '_eg_pages_v', column: 'version_available_domains' },
  { table: 'eg_posts', column: 'available_domains' },
  { table: '_eg_posts_v', column: 'version_available_domains' },
  { table: 'eg_products', column: 'available_domains' },
  { table: '_eg_products_v', column: 'version_available_domains' },
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const { table, column } of TABLES) {
    const existing = await columnsOf(db, table)
    if (existing.size > 0 && !existing.has(column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` text`))
    }
  }
  engine.logger.info('[migrate] Content domain availability columns are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the available_domains columns are left in place.')
}
