import { NextResponse } from 'next/server'

import { getCleanupDb, isAuthorisedDatabaseRequest } from '@/features/cleanup/guard'
import { planIndexRenames } from '@/features/cleanup/indexNames'
import { surveyDatabase } from '@/features/cleanup/survey'
import { getFeatureFlags } from '@/utilities/features'

// What every feature currently owns in the database: its tables, their row
// counts and how much space they take. Read-only.
//
// It is guarded as tightly as the cleanup route next door even though it
// changes nothing, because it hands back a complete map of the schema - the
// exact thing you would want before attacking it. Key AND admin session; see
// features/cleanup/guard.ts.

export async function POST(request: Request): Promise<Response> {
  if (!(await isAuthorisedDatabaseRequest(request))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const db = await getCleanupDb()
  if (!db) {
    return NextResponse.json({ error: 'No D1 binding available.' }, { status: 500 })
  }

  const stale = planIndexRenames(await db.listIndexes())
  const survey = await surveyDatabase(db, await getFeatureFlags(), stale.length)

  return NextResponse.json({ ok: true, ...survey })
}
