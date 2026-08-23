import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'

import { NEW_COLUMNS, NEW_INDEXES, NEW_TABLES } from '@/migrations/schema/builderSchema'

// Applies the page-builder schema additions straight against the live D1
// binding, from inside the deployed Worker.
//
// Why this exists rather than `payload migrate`: in this project's Cloudflare
// Workers Build environment, `payload migrate` can only ever reach a local
// emulated D1, never the real database (see the note on the D1 binding in
// wrangler.jsonc). Running the DDL through the Worker's own binding is the one
// path that is guaranteed to hit production.
//
// Every statement is idempotent: tables and indexes use IF NOT EXISTS, and each
// column add is guarded by a PRAGMA table_info check first, because SQLite's
// ALTER TABLE ADD COLUMN has no IF NOT EXISTS form. Re-running this on an
// already-migrated database is a no-op, which is what makes it safe to call on
// every deploy.
//
// Not a real secret - this only ever adds tables/columns and can never drop or
// modify existing data, so the header is a guard against accidental hits rather
// than a security boundary.
const GUARD_HEADER = 'x-seed-key'
const GUARD_VALUE = 'gracengatsby-seed'

type StepResult = { applied: string[]; skipped: number; errors: { statement: string; error: string }[] }

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get(GUARD_HEADER) !== GUARD_VALUE) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = env.D1

  if (!db) {
    return NextResponse.json({ error: 'No D1 binding available.' }, { status: 500 })
  }

  const tables: StepResult = { applied: [], skipped: 0, errors: [] }
  const columns: StepResult = { applied: [], skipped: 0, errors: [] }
  const indexes: StepResult = { applied: [], skipped: 0, errors: [] }

  // 1. Tables - CREATE TABLE IF NOT EXISTS is already idempotent.
  for (const entry of NEW_TABLES) {
    try {
      await db.prepare(entry.sql).run()
      tables.applied.push(entry.table)
    } catch (err) {
      tables.errors.push({ statement: entry.table, error: String((err as Error)?.message || err) })
    }
  }

  // 2. Columns - SQLite has no ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so
  //    read the current columns per table and only add what is genuinely missing.
  const existingColumns = new Map<string, Set<string>>()

  const columnsOf = async (table: string): Promise<Set<string>> => {
    const cached = existingColumns.get(table)
    if (cached) return cached
    try {
      const result = await db.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const names = new Set((result.results as { name: string }[]).map((row) => row.name))
      existingColumns.set(table, names)
      return names
    } catch {
      const empty = new Set<string>()
      existingColumns.set(table, empty)
      return empty
    }
  }

  for (const entry of NEW_COLUMNS) {
    const present = await columnsOf(entry.table)
    if (present.has(entry.column)) {
      columns.skipped++
      continue
    }
    try {
      await db.prepare(entry.sql).run()
      present.add(entry.column)
      columns.applied.push(`${entry.table}.${entry.column}`)
    } catch (err) {
      columns.errors.push({
        statement: `${entry.table}.${entry.column}`,
        error: String((err as Error)?.message || err),
      })
    }
  }

  // 3. Indexes - IF NOT EXISTS, and they depend on the tables/columns above.
  for (const entry of NEW_INDEXES) {
    try {
      await db.prepare(entry.sql).run()
      indexes.applied.push(entry.index)
    } catch (err) {
      indexes.errors.push({ statement: entry.index, error: String((err as Error)?.message || err) })
    }
  }

  const errorCount = tables.errors.length + columns.errors.length + indexes.errors.length

  return NextResponse.json(
    {
      ok: errorCount === 0,
      tables: { applied: tables.applied.length, errors: tables.errors },
      columns: { applied: columns.applied.length, skipped: columns.skipped, errors: columns.errors },
      indexes: { applied: indexes.applied.length, errors: indexes.errors },
    },
    { status: errorCount === 0 ? 200 : 500 },
  )
}
