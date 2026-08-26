import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'

import type { SchemaColumn, SchemaIndex, SchemaTable } from '@/migrations/schema/builderSchema'

import { renameTables } from '@/migrations/schema/applyRenames'
import { applySchemaAdditions } from '@/migrations/schema/applySchema'
import { bootstrapEngineTables } from '@/migrations/schema/engineBootstrap'
import { ENGINE_TABLE_RENAMES } from '@/migrations/schema/engineTables'
import { NEW_COLUMNS, NEW_INDEXES, NEW_TABLES } from '@/migrations/schema/builderSchema'
import { SETTINGS_COLUMNS, SETTINGS_INDEXES, SETTINGS_TABLES } from '@/migrations/schema/settingsSchema'
import { TABLE_RENAMES } from '@/migrations/schema/tableRenames'

// Applies every additive schema change straight against the live D1 binding,
// from inside the deployed Worker.
//
// Why this exists rather than the CLI's `migrate`: in this project's Cloudflare
// Workers Build environment, that command can only ever reach a local
// emulated D1, never the real database (see the note on the D1 binding in
// wrangler.jsonc). Running the DDL through the Worker's own binding is the one
// path guaranteed to hit production.
//
// Every statement is idempotent (see applySchemaAdditions), so re-running this
// on an already-migrated database is a no-op - which is what makes it safe to
// call on every deploy.
//
// Not a real secret: this only ever adds tables, columns and indexes and can
// never drop or modify existing data, so the header is a guard against
// accidental or crawler hits rather than a security boundary.
const GUARD_HEADER = 'x-seed-key'
const GUARD_VALUE = 'gracengatsby-seed'

/** Schema sets are applied in order; later sets may depend on earlier ones. */
const SCHEMA_SETS = [
  { name: 'page-builder', tables: NEW_TABLES, columns: NEW_COLUMNS, indexes: NEW_INDEXES },
  { name: 'settings', tables: SETTINGS_TABLES, columns: SETTINGS_COLUMNS, indexes: SETTINGS_INDEXES },
]

/**
 * Pulls the table an index is created on out of its `CREATE INDEX ... ON
 * \`table\` (...)` statement, so index entries can be filtered by table like
 * the table and column entries already are.
 */
const indexTarget = (statement: string): string =>
  statement.match(/\sON\s+`([^`]+)`/)?.[1] ?? ''

/**
 * The schema sets above were generated before the rename and still name the
 * pre-`eg_` tables. Once a table has been renamed, its old name must not be
 * touched again: `CREATE TABLE IF NOT EXISTS \`pages_blocks_hero\`` would
 * happily create a second, empty table under the retired name.
 *
 * So every entry whose table has already moved is dropped. That is not a loss -
 * the rename carried those tables, columns and indexes over intact, so the
 * additions are already present under the new name. Entries for tables that
 * have NOT been renamed yet (a database still mid-upgrade) are left in, and the
 * next deploy renames them.
 */
function withoutRenamedTables<T extends { tables: SchemaTable[]; columns: SchemaColumn[]; indexes: SchemaIndex[] }>(
  set: T,
  renamedAway: Set<string>,
): Pick<T, 'tables' | 'columns' | 'indexes'> {
  return {
    tables: set.tables.filter((entry) => !renamedAway.has(entry.table)),
    columns: set.columns.filter((entry) => !renamedAway.has(entry.table)),
    indexes: set.indexes.filter((entry) => !renamedAway.has(indexTarget(entry.sql))),
  }
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get(GUARD_HEADER) !== GUARD_VALUE) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = env.D1

  if (!db) {
    return NextResponse.json({ error: 'No D1 binding available.' }, { status: 500 })
  }

  const results: Record<string, unknown> = {}
  let errorCount = 0

  const tableExists = async (table: string): Promise<boolean> => {
    const result = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .bind(table)
      .all()
    return (result.results?.length ?? 0) > 0
  }

  // Renames run FIRST: every additive step below has to see the final table
  // names. Idempotent - a pair is only moved when the old table is still there
  // and the new one is not (see applyRenames), so this is a no-op on an
  // already-renamed database. SQLite carries each table's indexes across the
  // rename; their names keep the old text, which is cosmetic and left alone.
  const columnsOf = async (table: string): Promise<string[]> => {
    if (!(await tableExists(table))) return []
    const result = await db.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return (result.results as { name: string }[]).map((row) => row.name)
  }

  // The engine's own bookkeeping goes first, and with it the relationship
  // columns inside the locking and preferences `_rels` tables. Those columns
  // are named after the TABLE of the collection they point at, so they had to
  // move when the collections did - leaving them behind is what took the
  // portal down. See migrations/schema/engineBootstrap.ts.
  const engineReport = await bootstrapEngineTables({
    exists: tableExists,
    listTables: async () => {
      const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
      return (result.results as { name: string }[]).map((row) => row.name)
    },
    columnsOf,
    run: (statement) => db.prepare(statement).run(),
    countRows: async (table) => {
      const result = await db.prepare(`SELECT COUNT(*) AS n FROM \`${table}\``).all()
      return ((result.results?.[0] as { n: number } | undefined)?.n ?? 0)
    },
  })

  errorCount += engineReport.columns.errors.length + engineReport.tables.errors.length
  results['engine-tables'] = engineReport

  const renameReport = await renameTables({
    renames: TABLE_RENAMES,
    exists: tableExists,
    rename: (from, to) => db.prepare(`ALTER TABLE \`${from}\` RENAME TO \`${to}\``).run(),
  })

  errorCount += renameReport.errors.length
  results['table-renames'] = renameReport

  // Which old names are now gone for good, so the pre-rename schema sets below
  // can skip them instead of recreating them empty.
  const present = new Set(
    (
      (await db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all())
        .results as { name: string }[]
    ).map((row) => row.name),
  )
  // Engine renames count here too: the schema sets were generated when the
  // locking table was still `payload_locked_documents_rels`, and any entry
  // naming it now targets a table that no longer exists.
  const renamedAway = new Set(
    [...TABLE_RENAMES, ...ENGINE_TABLE_RENAMES]
      .filter((entry) => present.has(entry.to))
      .map((entry) => entry.from),
  )

  for (const rawSet of SCHEMA_SETS) {
    const set = withoutRenamedTables(rawSet, renamedAway)
    const report = await applySchemaAdditions({
      tables: set.tables,
      columns: set.columns,
      indexes: set.indexes,
      run: (statement) => db.prepare(statement).run(),
      columnsOf,
    })

    errorCount += report.errors.length
    results[rawSet.name] = report
  }

  return NextResponse.json({ ok: errorCount === 0, ...results }, { status: errorCount === 0 ? 200 : 500 })
}
