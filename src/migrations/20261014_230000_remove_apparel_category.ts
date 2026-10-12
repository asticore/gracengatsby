import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// The "Apparel" product category was removed. Products (and their saved versions) that still carry it become
// "physical", the closest remaining category. Idempotent: running it again changes nothing, and a table or column
// that does not exist on this database is skipped.

type Runner = MigrateUpArgs['db']

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const targets: [string, string][] = [
    ['eg_products', 'category'],
    ['_eg_products_v', 'version_category'],
  ]
  for (const [table, column] of targets) {
    if (!(await columnsOf(db, table)).has(column)) continue
    await db.run(sql.raw(`UPDATE \`${table}\` SET \`${column}\` = 'physical' WHERE \`${column}\` = 'apparel'`))
  }
  engine.logger.info('[migrate] apparel product category moved to physical.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - products stay in the physical category.')
}
