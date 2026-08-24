import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'

import { applySchemaAdditions } from '@/migrations/schema/applySchema'
import { NEW_COLUMNS, NEW_INDEXES, NEW_TABLES } from '@/migrations/schema/builderSchema'
import { SETTINGS_COLUMNS, SETTINGS_INDEXES, SETTINGS_TABLES } from '@/migrations/schema/settingsSchema'

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

  for (const set of SCHEMA_SETS) {
    const report = await applySchemaAdditions({
      tables: set.tables,
      columns: set.columns,
      indexes: set.indexes,
      run: (statement) => db.prepare(statement).run(),
      columnsOf: async (table) => {
        const result = await db.prepare(`PRAGMA table_info(\`${table}\`)`).all()
        return (result.results as { name: string }[]).map((row) => row.name)
      },
    })

    errorCount += report.errors.length
    results[set.name] = report
  }

  return NextResponse.json({ ok: errorCount === 0, ...results }, { status: errorCount === 0 ? 200 : 500 })
}
