/**
 * The database primitives the cleanup tool needs, and the D1 adapter for them.
 *
 * Deliberately shaped like `EngineDb` in migrations/schema/engineBootstrap.ts:
 * the survey and the drop logic never see a D1 handle, so the same code can be
 * pointed at a throwaway copy of the database in a test without a Worker
 * anywhere in sight. That is the only practical way to exercise a code path
 * whose whole job is to delete tables.
 */

/** A row of sqlite_master describing one index. */
export type IndexRecord = {
  name: string
  /** The table the index sits on, as SQLite currently reports it. */
  table: string
  /** Null for the implicit indexes SQLite creates for UNIQUE/PK constraints. */
  sql: string | null
}

export type CleanupDb = {
  listTables: () => Promise<string[]>
  listIndexes: () => Promise<IndexRecord[]>
  countRows: (table: string) => Promise<number>
  run: (statement: string) => Promise<unknown>
  /** Raw query, used for the size probes that may not be supported at all. */
  all: <T = Record<string, unknown>>(statement: string) => Promise<T[]>
}

/** The slice of the D1 binding used here, structurally typed so tests can fake it. */
type D1Like = {
  prepare: (statement: string) => {
    all: () => Promise<{ results?: unknown[] }>
    run: () => Promise<unknown>
  }
}

export function cleanupDbFromD1(db: D1Like): CleanupDb {
  const all = async <T>(statement: string): Promise<T[]> => {
    const result = await db.prepare(statement).all()
    return (result.results ?? []) as T[]
  }

  return {
    all,
    listTables: async () => {
      // `sqlite_%` covers the internal sequence/stat tables, which are never
      // ours and cannot be dropped anyway.
      const rows = await all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`,
      )
      return rows.map((row) => row.name)
    },
    listIndexes: async () => {
      const rows = await all<{ name: string; tbl_name: string; sql: string | null }>(
        `SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' ORDER BY name`,
      )
      return rows.map((row) => ({ name: row.name, table: row.tbl_name, sql: row.sql ?? null }))
    },
    countRows: async (table) => {
      const rows = await all<{ n: number }>(`SELECT COUNT(*) AS n FROM \`${table}\``)
      return Number(rows[0]?.n ?? 0)
    },
    run: (statement) => db.prepare(statement).run(),
  }
}
