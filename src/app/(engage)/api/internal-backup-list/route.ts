import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'

import { availableBackups } from '@/features/backups'
import { getEngine } from '@/lib/engine'
import { hasInternalRouteKey } from '@/utilities/internalRouteGuard'

/**
 * What can be restored from, read from the destination rather than from the
 * `eg_backups` table.
 *
 * The table records attempts; the bucket holds copies. They disagree whenever a
 * run died after uploading, or someone cleared out old files by hand at the far
 * end - and in both cases it is the bucket that is right about what a restore
 * can actually use.
 *
 * Admin-only. The reply names the bucket, the paths and the row counts inside
 * each backup, which together describe the shape of the whole site.
 */

export const maxDuration = 60

async function isAdminRequest(request: Request): Promise<boolean> {
  try {
    const engine = await getEngine()
    const { user } = await engine.auth({ headers: request.headers })
    return Boolean(user && (user as { roles?: string[] }).roles?.includes('admin'))
  } catch {
    return false
  }
}

export async function GET(request: Request): Promise<Response> {
  const allowed = hasInternalRouteKey(request) || (await isAdminRequest(request))
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { env } = await getCloudflareContext({ async: true })
  if (!env?.D1) {
    return NextResponse.json({ ok: false, error: 'No database is available to this deployment.' }, { status: 500 })
  }

  try {
    const result = await availableBackups(env.D1)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      ok: false,
      backups: [],
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
