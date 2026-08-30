import { NextResponse } from 'next/server'

import { runCleanup } from '@/features/cleanup/cleanup'
import { getCleanupDb, isAuthorisedDatabaseRequest } from '@/features/cleanup/guard'
import { getFeatureFlags } from '@/utilities/features'

// Drops the tables belonging to a switched-off feature.
//
// The most destructive endpoint in the project, so it is the most guarded one:
// the internal key AND an admin session (features/cleanup/guard.ts), the
// feature has to be off, the confirmation phrase has to name it, and `execute`
// has to be set. A request with none of those - which is what a replayed or
// truncated one looks like - comes back as a plan and touches nothing.
//
// Body: { "feature": "blog", "confirm": "drop blog", "execute": true }
// Leave out `execute` to see the plan first. Always do that first.

export async function POST(request: Request): Promise<Response> {
  if (!(await isAuthorisedDatabaseRequest(request))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch((): null => null)) as {
    feature?: unknown
    confirm?: unknown
    execute?: unknown
  } | null

  if (typeof body?.feature !== 'string') {
    return NextResponse.json({ error: 'A "feature" is required.' }, { status: 400 })
  }

  const db = await getCleanupDb()
  if (!db) {
    return NextResponse.json({ error: 'No D1 binding available.' }, { status: 500 })
  }

  const result = await runCleanup(db, await getFeatureFlags(), {
    feature: body.feature,
    confirm: typeof body.confirm === 'string' ? body.confirm : undefined,
    // Only a literal `true` counts. A string "true", a 1, or anything a shell
    // or form might turn the flag into leaves this a dry run.
    execute: body.execute === true,
  })

  // A refusal is a 409, not a 500: the request was understood and answered,
  // and the body says exactly which guardrail stopped it.
  const status = result.ok ? 200 : result.refusals.length > 0 ? 409 : 500
  return NextResponse.json(result, { status })
}
