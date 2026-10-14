import { MAX_TABLES_COUNTED, R2_SAMPLE_LIMIT, TOP_TABLES_SHOWN } from './model'

/**
 * Storage readings for Site health: the database's total size, the largest
 * tables by row count, and the R2 bucket's object count. Each reader returns
 * null or an empty list when the binding cannot answer, so the screen can say
 * so instead of failing.
 */

export type TableCount = { name: string; rows: number }

export type R2Summary = { objects: number; bytes: number; sampled: boolean }

const pragmaNumber = async (db: D1Database, pragma: 'page_count' | 'page_size'): Promise<number | null> => {
  try {
    const result = await db.prepare(`PRAGMA ${pragma}`).all()
    const value = Number((result.results?.[0] as Record<string, unknown> | undefined)?.[pragma])
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Whole-database size in bytes, from page count times page size. Null when D1 does not answer. */
export async function databaseBytes(db: D1Database): Promise<number | null> {
  const pages = await pragmaNumber(db, 'page_count')
  const size = await pragmaNumber(db, 'page_size')
  return pages === null || size === null ? null : pages * size
}

/**
 * Row counts of the site's own tables (eg_*), largest first. Reads at most
 * MAX_TABLES_COUNTED tables; `capped` is true when there were more. A table that
 * fails to count is skipped rather than failing the whole list.
 */
export async function topTables(db: D1Database): Promise<{ tables: TableCount[]; counted: number; capped: boolean }> {
  let names: string[] = []
  try {
    const result = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'eg\\_%' ESCAPE '\\' ORDER BY name")
      .all()
    names = ((result.results ?? []) as { name: string }[]).map((row) => row.name)
  } catch {
    return { tables: [], counted: 0, capped: false }
  }

  const capped = names.length > MAX_TABLES_COUNTED
  const counts: TableCount[] = []
  for (const name of names.slice(0, MAX_TABLES_COUNTED)) {
    try {
      const result = await db.prepare(`SELECT COUNT(*) AS n FROM \`${name}\``).all()
      const rows = Number((result.results?.[0] as { n?: number } | undefined)?.n ?? 0)
      counts.push({ name, rows: Number.isFinite(rows) ? rows : 0 })
    } catch {
      // A table that cannot be counted is left out of the list.
    }
  }

  counts.sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name))
  return { tables: counts.slice(0, TOP_TABLES_SHOWN), counted: counts.length, capped }
}

/**
 * Object count and total bytes of the R2 bucket. Lists at most R2_SAMPLE_LIMIT
 * objects, so `sampled` is true when the bucket holds more than that.
 */
export async function r2Summary(bucket: R2Bucket | undefined): Promise<R2Summary | null> {
  if (!bucket) return null
  try {
    const listing = await bucket.list({ limit: R2_SAMPLE_LIMIT })
    const bytes = listing.objects.reduce((sum, object) => sum + Number(object.size || 0), 0)
    return { objects: listing.objects.length, bytes, sampled: Boolean(listing.truncated) }
  } catch {
    return null
  }
}
