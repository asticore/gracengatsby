import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// "Allowed domains" (src/features/domains/access.ts) on users (eg_users) and custom roles (eg_roles): one text
// column each, `allowed_domains`, holding the delimited host list (",a.com,b.com,"), or NULL for every domain.
// Idempotent: a column is added only when PRAGMA table_info says it is missing, and a table that is not there yet
// is skipped (its own migration creates it with the column in the schema). Registered last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const TABLES = ['eg_users', 'eg_roles']

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const table of TABLES) {
    const existing = await columnsOf(db, table)
    if (existing.size > 0 && !existing.has('allowed_domains')) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`allowed_domains\` text`))
    }
  }
  engine.logger.info('[migrate] Allowed domains columns on users and roles are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the allowed_domains columns are left in place.')
}
