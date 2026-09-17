import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { hasInternalRouteKey } from '@/utilities/internalRouteGuard'

// Applies every additive schema change and every safe-to-replay migration
// straight against the live D1 binding, from inside the deployed Worker.
//
// Why this exists rather than the CLI's `migrate`: in this project's Cloudflare
// Workers Build environment, that command can only ever reach a local
// emulated D1, never the real database (see the note on the D1 binding in
// wrangler.jsonc). Running the DDL through the Worker's own binding is the one
// path guaranteed to hit production.
//
// The actual sequence lives in `@/migrations/runInternalMigrate` - a plain
// function taking a raw `D1Database`, so it can also be run in a test against
// a genuinely empty D1 without any Next.js request machinery. See that file's
// header comment for the full sequence and, importantly, for the fresh-install
// gap it closes (this route used to only ever run the LAST 7 of this app's 18
// real migrations, which left a brand-new database with none of its ~150
// foundational tables).
//
// Guarded by INTERNAL_ROUTE_KEY (see utilities/internalRouteGuard). It only
// ever adds tables, columns and indexes and can never drop or modify existing
// data - but each call runs unbounded D1 work, so it is not something to leave
// open to the internet.
export async function POST(request: Request): Promise<Response> {
  if (!hasInternalRouteKey(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const db = env.D1

  if (!db) {
    return NextResponse.json({ error: 'No D1 binding available.' }, { status: 500 })
  }

  const { results, errorCount } = await runInternalMigrate(db, consoleLogger)

  return NextResponse.json({ ok: errorCount === 0, ...results }, { status: errorCount === 0 ? 200 : 500 })
}
