import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { seedHomeAndTemplates } from '@/seed/seedHomeAndTemplates'

// Idempotent seed endpoint, hit over real HTTP against the deployed Worker
// (see `deploy:seed` in package.json, run right after `deploy:app`) so it
// runs with genuine production D1 bindings - `payload migrate` in this CI
// environment can only ever reach a local emulated database, never real D1.
//
// Not a real secret - this only ever creates a fixed, non-destructive set of
// starter content and is a full no-op once a Home page/templates exist, so
// the header is just a guard against accidental/crawler hits rather than a
// security boundary.
const SEED_GUARD_HEADER = 'x-seed-key'
const SEED_GUARD_VALUE = 'gracengatsby-seed'

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get(SEED_GUARD_HEADER) !== SEED_GUARD_VALUE) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = await getPayload({ config })
  const result = await seedHomeAndTemplates(payload)

  return NextResponse.json({ ok: true, ...result })
}
