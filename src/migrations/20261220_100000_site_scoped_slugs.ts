import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Slugs are unique per domain, not per table (features/domains/scope.ts slugClaimsConflict): the same slug can be used by a
// post or product on another domain. The old unique index on the slug blocked that, so it is replaced by a plain lookup
// index. Pages were already unique per parent (their own validate), so only posts and products change here.
// Idempotent: the unique index is dropped only when it exists and is unique, the lookup index is created IF NOT EXISTS, and a
// table that is not there yet is skipped (its own migration creates it). Registered last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const TABLES = [
  { table: 'eg_posts', uniqueIndex: 'posts_slug_idx', lookupIndex: 'eg_posts_slug_scoped_idx' },
  { table: 'eg_products', uniqueIndex: 'products_slug_idx', lookupIndex: 'eg_products_slug_scoped_idx' },
]

const tableExists = async (db: Runner, table: string): Promise<boolean> =>
  ((await db.all(sql.raw(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`))) as unknown[]).length > 0

const isUniqueIndex = async (db: Runner, name: string): Promise<boolean> => {
  const rows = (await db.all(sql.raw(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = '${name}'`))) as { sql: string | null }[]
  return rows.some((row) => typeof row.sql === 'string' && /^\s*CREATE\s+UNIQUE/i.test(row.sql))
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const { table, uniqueIndex, lookupIndex } of TABLES) {
    if (!(await tableExists(db, table))) continue
    if (await isUniqueIndex(db, uniqueIndex)) {
      await db.run(sql.raw(`DROP INDEX \`${uniqueIndex}\``))
    }
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`${lookupIndex}\` ON \`${table}\` (\`slug\`)`))
  }
  engine.logger.info('[migrate] Post and product slugs are unique per domain.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the slug lookup indexes are left in place.')
}
