import { NextResponse } from 'next/server'

import { getCleanupDb, isAuthorisedDatabaseRequest } from '@/features/cleanup/guard'
import { tidyIndexNames } from '@/features/cleanup/indexNames'

// Renames indexes still carrying their pre-`eg_` table name.
//
// Cosmetic, idempotent, and never leaves a table without an index - the new
// one is created before the old one is dropped. See
// features/cleanup/indexNames.ts for why that order is not negotiable.
//
// Body: { "execute": true }. Without it you get the plan.

export async function POST(request: Request): Promise<Response> {
  if (!(await isAuthorisedDatabaseRequest(request))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch((): null => null)) as { execute?: unknown } | null

  const db = await getCleanupDb()
  if (!db) {
    return NextResponse.json({ error: 'No D1 binding available.' }, { status: 500 })
  }

  const report = await tidyIndexNames(db, body?.execute === true)
  return NextResponse.json(report, { status: report.ok ? 200 : 500 })
}
