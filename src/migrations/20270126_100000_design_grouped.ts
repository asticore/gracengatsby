import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'
import { convertDesignColumn, convertDesignsInTree, type ConvertCount } from '@/lib/design/storedGrouped'

/**
 * Design model, unified: stored v1 flat designs become the grouped shape (upgradeV1), so the
 * whole site reads one model. See src/lib/design/storedGrouped.ts for what is converted and
 * what is left alone (schemaVersion 2 values and flat values with no grouped key).
 *
 * Where designs are stored (found by the schema, not a fixed list, so new block tables are covered):
 *   - every table with a `design` column (page, post, product, page-template and settings block
 *     tables, element and section blocks, their _v draft twins, reusable sections, site templates);
 *   - the `columns` JSON of every section block table (`*_blocks_section`), where each column and
 *     each nested block has its own `design`;
 *   - the `layout` and `published_layout` JSON of eg_forms, which hold the same column tree.
 *
 * Idempotent: converted values are schemaVersion 2 with groups, so a second run changes nothing.
 * Rows are written only when a conversion happened. down is a no-op (the grouped values read
 * back as the same flat design, so rolling the code back still renders).
 */

type Runner = MigrateUpArgs['db']
type Row = { rid: number; value: unknown }

const quoteName = (name: string): string => name.replace(/`/g, '')

async function userTables(db: Runner): Promise<string[]> {
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)) as { name: string }[]
  return rows.map((row) => row.name)
}

async function columnNames(db: Runner, table: string): Promise<Set<string>> {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${quoteName(table)}\`)`))) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

/** The JSON columns of a table that hold designs, and whether each is one design or a tree. */
function designColumnsOf(table: string, columns: Set<string>): { name: string; tree: boolean }[] {
  const out: { name: string; tree: boolean }[] = []
  if (columns.has('design')) out.push({ name: 'design', tree: false })
  if (table.includes('_blocks_section') && columns.has('columns')) out.push({ name: 'columns', tree: true })
  if (table === 'eg_forms') {
    for (const name of ['layout', 'published_layout']) if (columns.has(name)) out.push({ name, tree: true })
  }
  return out
}

async function convertColumn(db: Runner, table: string, column: string, tree: boolean): Promise<number> {
  const rows = (await db.all(
    sql`SELECT rowid AS rid, ${sql.identifier(column)} AS value FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} IS NOT NULL`,
  )) as Row[]
  let changedRows = 0
  for (const row of rows) {
    if (typeof row.value !== 'string' || row.value === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(row.value)
    } catch {
      continue
    }
    const count: ConvertCount = { converted: 0 }
    const next = tree ? convertDesignsInTree(parsed, count) : convertDesignColumn(parsed, count)
    if (count.converted === 0) continue
    await db.run(
      sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)} = ${JSON.stringify(next)} WHERE rowid = ${row.rid}`,
    )
    changedRows += 1
  }
  return changedRows
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  let changed = 0
  for (const table of await userTables(db)) {
    const targets = designColumnsOf(table, await columnNames(db, table))
    for (const target of targets) changed += await convertColumn(db, table, target.name, target.tree)
  }
  engine.logger.info(`[migrate] Stored designs use the unified grouped model (${changed} rows converted).`)
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - grouped designs read back as the same flat design.')
}
