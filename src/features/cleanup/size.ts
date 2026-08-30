/**
 * How much space a table is using.
 *
 * SQLite can answer this exactly through the `dbstat` virtual table, but
 * dbstat is a compile-time option and D1 does not expose it. Rather than
 * decide up front, this probes once per survey: if `dbstat` answers, the
 * numbers are real; if it errors, every figure is derived and the survey says
 * so in the report, and the UI repeats it. A made-up exact-looking byte count
 * is worse than an honest range.
 *
 * The fallback samples rows and multiplies. That is genuinely rough - it does
 * not see page slack, overflow pages or free space - so it carries a factor
 * for index and page overhead and is never presented as anything but an
 * estimate.
 */

import type { CleanupDb, IndexRecord } from './db'

/** Rows read per table when estimating. Enough to average, cheap to run. */
const SAMPLE_ROWS = 50

/**
 * Multiplier applied to raw row bytes to account for indexes, page headers and
 * slack. Every table here carries at least a primary key and usually two or
 * three secondary indexes, which is where the bulk of the difference lives.
 */
const OVERHEAD_FACTOR = 1.6

export type TableSize = {
  table: string
  rows: number
  bytes: number
}

export type SizeReport = {
  /** True only when dbstat answered - i.e. the byte counts are measured. */
  exact: boolean
  sizes: Map<string, TableSize>
  /** Whole-database size from page_count x page_size, when the pragmas work. */
  databaseBytes: number | null
  /** Plain-language note the UI shows verbatim. */
  note: string
}

const byteLengthOf = (value: unknown): number => {
  if (value === null || value === undefined) return 1
  if (typeof value === 'string') {
    // Cheap approximation of UTF-8 length; content here is overwhelmingly
    // ASCII, and being a few percent out does not change an estimate.
    return value.length
  }
  if (typeof value === 'number') return 8
  if (typeof value === 'boolean') return 1
  if (value instanceof Uint8Array) return value.byteLength
  if (value instanceof ArrayBuffer) return value.byteLength
  return String(value).length
}

/** Exact per-table page usage, or null when dbstat is unavailable. */
async function measureWithDbstat(db: CleanupDb): Promise<Map<string, number> | null> {
  try {
    const rows = await db.all<{ name: string; bytes: number }>(
      `SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name`,
    )
    if (rows.length === 0) return null
    return new Map(rows.map((row) => [row.name, Number(row.bytes ?? 0)]))
  } catch {
    return null
  }
}

async function databaseBytes(db: CleanupDb): Promise<number | null> {
  try {
    const pages = await db.all<{ page_count: number }>('PRAGMA page_count')
    const size = await db.all<{ page_size: number }>('PRAGMA page_size')
    const count = Number(pages[0]?.page_count ?? 0)
    const bytes = Number(size[0]?.page_size ?? 0)
    if (!count || !bytes) return null
    return count * bytes
  } catch {
    return null
  }
}

/** Average bytes per row from a sample, or 0 for an empty table. */
async function averageRowBytes(db: CleanupDb, table: string): Promise<number> {
  const rows = await db
    .all<Record<string, unknown>>(`SELECT * FROM \`${table}\` LIMIT ${SAMPLE_ROWS}`)
    .catch((): Record<string, unknown>[] => [])

  if (rows.length === 0) return 0

  let total = 0
  for (const row of rows) {
    for (const value of Object.values(row)) total += byteLengthOf(value)
  }
  return total / rows.length
}

/**
 * Row counts for every table, plus the best size figure available. Sizes for
 * an index sit on the index's own name in dbstat, so each table's measured
 * total folds in anything whose name is the table's own - that is how the
 * exact path stays comparable with the estimated one.
 */
export async function surveySizes(db: CleanupDb, tables: string[]): Promise<SizeReport> {
  const measured = await measureWithDbstat(db)
  const total = await databaseBytes(db)
  const sizes = new Map<string, TableSize>()

  for (const table of tables) {
    const rows = await db.countRows(table).catch((): number => 0)

    if (measured) {
      sizes.set(table, { table, rows, bytes: measured.get(table) ?? 0 })
      continue
    }

    const average = rows === 0 ? 0 : await averageRowBytes(db, table)
    sizes.set(table, { table, rows, bytes: Math.round(rows * average * OVERHEAD_FACTOR) })
  }

  // When dbstat answered, fold each index's pages into its table's total.
  if (measured) {
    const indexes = await db.listIndexes().catch((): IndexRecord[] => [])
    for (const index of indexes) {
      const entry = sizes.get(index.table)
      if (!entry) continue
      entry.bytes += measured.get(index.name) ?? 0
    }
  }

  return {
    exact: Boolean(measured),
    sizes,
    databaseBytes: total,
    note: measured
      ? 'Sizes are measured from the database itself.'
      : 'Sizes are estimates. This database does not report per-table page usage, so each figure is worked out from a sample of rows and is indicative only.',
  }
}

/** Human-readable bytes. Estimates are labelled by the caller, not here. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  if (bytes < 1024) return '< 1 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
