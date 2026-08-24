import type { SchemaColumn, SchemaIndex, SchemaTable } from './builderSchema'

/**
 * Applies a set of additive schema changes idempotently.
 *
 * Shared by the migrations (which run against a local emulated D1 through
 * Payload's db handle) and /api/internal-migrate (which runs against the real
 * D1 binding inside the deployed Worker). Both need identical semantics, and
 * having one implementation means they cannot drift apart.
 *
 * Idempotency comes from three places:
 *   - tables and indexes use CREATE ... IF NOT EXISTS
 *   - columns are checked against PRAGMA table_info first, because SQLite has
 *     no ALTER TABLE ... ADD COLUMN IF NOT EXISTS
 *   - the caller supplies `run` and `columnsOf`, so neither side needs to know
 *     how the other talks to the database
 *
 * Errors are collected rather than thrown so one bad statement cannot abort the
 * rest - the caller decides what to do with the report.
 */
export type SchemaAdditions = {
  tables: SchemaTable[]
  columns: SchemaColumn[]
  indexes: SchemaIndex[]
  run: (statement: string) => Promise<unknown>
  columnsOf: (table: string) => Promise<string[]>
  /** When true, a failed statement aborts instead of being collected. */
  throwOnError?: boolean
}

export type SchemaReport = {
  tablesApplied: number
  columnsApplied: number
  columnsSkipped: number
  indexesApplied: number
  errors: { statement: string; error: string }[]
}

export async function applySchemaAdditions(options: SchemaAdditions): Promise<SchemaReport> {
  const { tables, columns, indexes, run, columnsOf, throwOnError = false } = options

  const report: SchemaReport = {
    tablesApplied: 0,
    columnsApplied: 0,
    columnsSkipped: 0,
    indexesApplied: 0,
    errors: [],
  }

  const fail = async (label: string, error: unknown) => {
    if (throwOnError) throw error
    report.errors.push({ statement: label, error: String((error as Error)?.message || error) })
  }

  for (const entry of tables) {
    try {
      await run(entry.sql)
      report.tablesApplied++
    } catch (error) {
      await fail(entry.table, error)
    }
  }

  // Cache each table's column list so a table with several new columns is only
  // introspected once.
  const known = new Map<string, Set<string>>()

  for (const entry of columns) {
    let present = known.get(entry.table)
    if (!present) {
      try {
        present = new Set(await columnsOf(entry.table))
      } catch {
        // Table missing entirely - let the ALTER below report the real problem.
        present = new Set<string>()
      }
      known.set(entry.table, present)
    }

    if (present.has(entry.column)) {
      report.columnsSkipped++
      continue
    }

    try {
      await run(entry.sql)
      present.add(entry.column)
      report.columnsApplied++
    } catch (error) {
      await fail(`${entry.table}.${entry.column}`, error)
    }
  }

  for (const entry of indexes) {
    try {
      await run(entry.sql)
      report.indexesApplied++
    } catch (error) {
      await fail(entry.index, error)
    }
  }

  return report
}
