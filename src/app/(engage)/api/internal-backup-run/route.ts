import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'

import { runBackup } from '@/features/backups'
import { hasInternalRouteKey } from '@/utilities/internalRouteGuard'
import { getEngine } from '@/lib/engine'

/**
 * Takes a backup now.
 *
 * Two ways in, because there are two callers. The "Back up now" button in the
 * browser cannot hold a secret, so it authenticates with the admin session it
 * already has. An external runner - a scheduled job on a machine that has the
 * TCP the Worker does not, for an FTP or SFTP destination - has no session, so
 * it carries INTERNAL_ROUTE_KEY like the other internal endpoints.
 *
 * Either way this is a POST that spends bandwidth and storage at somebody's
 * expense, so it is never open. An unauthenticated caller gets 404 rather than
 * 401, matching the other guarded routes: there is nothing to be gained from
 * confirming the endpoint exists.
 *
 * The manual run is given a shorter time budget than the scheduled one. A
 * browser request that runs for ten minutes has long since been abandoned by
 * whoever pressed the button, and a run nobody is watching should be the
 * scheduled one.
 */

const MANUAL_BUDGET_MS = 4 * 60 * 1000

export const maxDuration = 300

async function isAdminRequest(request: Request): Promise<boolean> {
  try {
    const engine = await getEngine()
    const { user } = await engine.auth({ headers: request.headers })
    return Boolean(user && (user as { roles?: string[] }).roles?.includes('admin'))
  } catch {
    return false
  }
}

export async function POST(request: Request): Promise<Response> {
  const allowed = hasInternalRouteKey(request) || (await isAdminRequest(request))
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { env } = await getCloudflareContext({ async: true })

  if (!env?.D1 || !env?.R2) {
    return NextResponse.json(
      { ok: false, error: 'The database or media storage is not available to this deployment.' },
      { status: 500 },
    )
  }

  const result = await runBackup({
    db: env.D1,
    bucket: env.R2,
    trigger: 'manual',
    budgetMs: MANUAL_BUDGET_MS,
  })

  // Always 200: the body carries the verdict. A non-2xx would be
  // indistinguishable from the route itself failing, and the button's whole job
  // is to report exactly what the destination said.
  return NextResponse.json(result)
}
