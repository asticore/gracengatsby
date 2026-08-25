/**
 * Applies a set of table renames idempotently.
 *
 * Shared by the rename migration (which runs against a local emulated D1
 * through the CMS engine's db handle) and /api/internal-migrate (which runs
 * against the real D1 binding inside the deployed Worker), for the same reason
 * applySchema.ts is shared: both need identical semantics and must not drift.
 *
 * SQLite has no `ALTER TABLE ... RENAME IF EXISTS`, so each pair is checked
 * against sqlite_master first: the rename happens only when the old table is
 * still present AND the new one is not. Re-running is therefore a no-op, and a
 * run that died half way through resumes cleanly.
 *
 * Errors are collected rather than thrown, matching applySchemaAdditions - the
 * caller decides what to do with the report.
 */
export type TableRename = { from: string; to: string }

export type RenameOptions = {
  renames: TableRename[]
  /** Resolves true when a table of this exact name exists. */
  exists: (table: string) => Promise<boolean>
  rename: (from: string, to: string) => Promise<unknown>
  /** When true, a failed rename aborts instead of being collected. */
  throwOnError?: boolean
}

export type RenameReport = {
  renamed: number
  /** Already renamed on a previous run, or never present in this database. */
  skipped: number
  errors: { statement: string; error: string }[]
}

export async function renameTables(options: RenameOptions): Promise<RenameReport> {
  const { renames, exists, rename, throwOnError = false } = options

  const report: RenameReport = { renamed: 0, skipped: 0, errors: [] }

  for (const entry of renames) {
    try {
      // Both checks matter: `from` missing means there is nothing to move,
      // `to` present means someone (an earlier run, or the other apply path)
      // already moved it. Either way, doing the rename would fail.
      if (!(await exists(entry.from)) || (await exists(entry.to))) {
        report.skipped++
        continue
      }

      await rename(entry.from, entry.to)
      report.renamed++
    } catch (error) {
      if (throwOnError) throw error
      report.errors.push({
        statement: `${entry.from} -> ${entry.to}`,
        error: String((error as Error)?.message || error),
      })
    }
  }

  return report
}
