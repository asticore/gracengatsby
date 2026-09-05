import { getEngine } from '@/engine'
import { NextResponse } from 'next/server'

import { seedHomeAndTemplates } from '@/seed/seedHomeAndTemplates'
import { hasInternalRouteKey } from '@/utilities/internalRouteGuard'

// Idempotent seed endpoint, hit over real HTTP against the deployed Worker
// (see `deploy:seed` in package.json, run right after `deploy:app`) so it
// runs with genuine production D1 bindings - the CLI's `migrate` in this CI
// environment can only ever reach a local emulated database, never real D1.
//
// Not a real secret - this only ever creates a fixed, non-destructive set of
// starter content and is a full no-op once a Home page/templates exist, so
// the header is just a guard against accidental/crawler hits rather than a
// security boundary.

export async function POST(request: Request): Promise<Response> {
  if (!hasInternalRouteKey(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const engine = await getEngine()
  const result = await seedHomeAndTemplates(engine)

  return NextResponse.json({ ok: true, ...result })
}
