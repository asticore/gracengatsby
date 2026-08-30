/**
 * Renames indexes left behind by the `eg_` table rename.
 *
 * SQLite carries a table's indexes across `ALTER TABLE ... RENAME TO` but
 * keeps their names, so `pages_slug_idx` now sits on `eg_pages`. Purely
 * cosmetic - the index works exactly as before - but it makes every EXPLAIN,
 * every `.schema` dump and every future migration read as though the rename
 * only half happened.
 *
 * There is no `ALTER INDEX ... RENAME`, so the only way to do this is create
 * the index again under the right name and then drop the old one. The order
 * matters and is not negotiable: create first, drop second. Done the other way
 * round, a failure between the two statements leaves the table with no index
 * at all - a silent, table-scanning performance cliff that nothing would
 * report. This way the worst case is a duplicate index, which costs a little
 * space and is fixed by running the action again.
 *
 * Idempotent throughout: an index already correctly named is skipped, and one
 * whose target name is taken is skipped rather than overwritten.
 */

import { ENGINE_TABLE_RENAMES } from '@/migrations/schema/engineTables'
import { TABLE_RENAMES } from '@/migrations/schema/tableRenames'

import type { CleanupDb, IndexRecord } from './db'

export type IndexRename = {
  from: string
  to: string
  table: string
  createStatement: string
}

export type IndexTidyReport = {
  ok: boolean
  dryRun: boolean
  renames: IndexRename[]
  renamed: string[]
  /** Already correct, or the new name is taken. */
  skipped: number
  errors: { statement: string; error: string }[]
}

const ALL_RENAMES = [...TABLE_RENAMES, ...ENGINE_TABLE_RENAMES]

/**
 * Rewrites the index name inside a `CREATE INDEX` statement, leaving the rest
 * of it - UNIQUE, the column list, any partial-index WHERE - exactly as SQLite
 * stored it. Rebuilding the statement from parts would risk losing a clause;
 * substituting one token cannot.
 */
export function rewriteCreateStatement(sql: string, from: string, to: string): string | null {
  const pattern = new RegExp(
    `^(\\s*CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)(\`${from}\`|"${from}"|\\[${from}\\]|${from})(\\s)`,
    'i',
  )
  if (!pattern.test(sql)) return null
  return sql.replace(pattern, `$1\`${to}\`$3`)
}

/**
 * Works out the correct name for an index from the rename table: if the index
 * is named after a table's old name and now sits on that table's new name, the
 * new name replaces the old prefix. Anything that does not match that exact
 * shape is left alone - guessing at an index's intended name is how you rename
 * something that was never stale.
 */
export function planIndexRenames(indexes: IndexRecord[]): IndexRename[] {
  const existing = new Set(indexes.map((index) => index.name))
  const plan: IndexRename[] = []

  for (const index of indexes) {
    // Implicit UNIQUE/PK indexes have no SQL and cannot be recreated by name.
    if (!index.sql) continue

    for (const rename of ALL_RENAMES) {
      if (index.table !== rename.to) continue
      if (!index.name.startsWith(`${rename.from}_`)) continue

      const target = `${rename.to}${index.name.slice(rename.from.length)}`
      if (target === index.name || existing.has(target)) break

      const createStatement = rewriteCreateStatement(index.sql, index.name, target)
      if (!createStatement) break

      plan.push({ from: index.name, to: target, table: index.table, createStatement })
      // Reserve the name so two stale indexes cannot both claim it.
      existing.add(target)
      break
    }
  }

  return plan
}

export async function tidyIndexNames(db: CleanupDb, execute = false): Promise<IndexTidyReport> {
  const indexes = await db.listIndexes()
  const renames = planIndexRenames(indexes)

  const report: IndexTidyReport = {
    ok: true,
    dryRun: !execute,
    renames,
    renamed: [],
    skipped: indexes.length - renames.length,
    errors: [],
  }

  if (!execute) return report

  for (const rename of renames) {
    try {
      await db.run(rename.createStatement)
    } catch (error) {
      report.errors.push({
        statement: rename.createStatement,
        error: String((error as Error)?.message || error),
      })
      // The old index is still there and still working, so stop before the
      // drop rather than risk leaving the table uncovered.
      continue
    }

    try {
      await db.run(`DROP INDEX IF EXISTS \`${rename.from}\``)
      report.renamed.push(`${rename.from} -> ${rename.to}`)
    } catch (error) {
      report.errors.push({
        statement: `DROP INDEX \`${rename.from}\``,
        error: String((error as Error)?.message || error),
      })
    }
  }

  report.ok = report.errors.length === 0
  return report
}
