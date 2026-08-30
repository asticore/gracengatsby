import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'

import { RESTORE_CONFIRMATION, restoreBackup, type RestorePart } from '@/features/backups'
import { getEngine } from '@/lib/engine'

/**
 * Replaces the live site with the contents of a backup.
 *
 * This is the most destructive endpoint in the portal, so unlike the other
 * internal routes it accepts ONLY an admin session - the shared
 * INTERNAL_ROUTE_KEY is not enough. That key lives in CI configuration and in a
 * deploy script; it is the right boundary for something additive like the
 * schema step and the wrong one for something that empties every table. A
 * restore should require a person who is signed in.
 *
 * The typed confirmation is checked again inside restoreBackup rather than only
 * here, so the guard cannot be lost by a future caller that skips this route.
 *
 * Dry runs are the recommended first call: they perform every check - manifest
 * readable, tables present, columns unchanged, what is already in the way - and
 * return without touching anything.
 */

export const maxDuration = 300

const PARTS: RestorePart[] = ['database', 'settings', 'media']

type Body = {
  backupId?: string
  confirm?: string
  overwrite?: boolean
  dryRun?: boolean
  parts?: string[]
}

export async function POST(request: Request): Promise<Response> {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: request.headers })

  if (!user || !(user as { roles?: string[] }).roles?.includes('admin')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Body

  if (!body.backupId) {
    return NextResponse.json({ ok: false, error: 'No backup was named.' }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  if (!env?.D1 || !env?.R2) {
    return NextResponse.json(
      { ok: false, error: 'The database or media storage is not available to this deployment.' },
      { status: 500 },
    )
  }

  // Only the three known part names are passed through; an unrecognised one is
  // dropped rather than defaulting to "everything", so a typo can never widen
  // the blast radius of a restore that was meant to be narrow.
  const parts = Array.isArray(body.parts)
    ? (body.parts.filter((part): part is RestorePart => PARTS.includes(part as RestorePart)) as RestorePart[])
    : undefined

  const report = await restoreBackup({
    db: env.D1,
    bucket: env.R2,
    backupId: body.backupId,
    confirm: String(body.confirm ?? ''),
    overwrite: body.overwrite === true,
    dryRun: body.dryRun === true,
    ...(parts && parts.length > 0 ? { parts } : {}),
  })

  return NextResponse.json({ ...report, confirmationWord: RESTORE_CONFIRMATION })
}
