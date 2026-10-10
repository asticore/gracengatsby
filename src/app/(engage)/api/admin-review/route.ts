import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { handleReviewGet, handleReviewPost } from '@/features/approval/handlers'
import { viewerFromContext } from '@/features/approval/viewer'

export const dynamic = 'force-dynamic'

/**
 * Content approval for one document.
 *
 * GET ?collection=<slug>&id=<docId>: status, approvals, what this user may do, and the history.
 * POST { collection, id, action, note?, alsoPublish? }: one review step. action is one of
 *   submit | approve | request_changes | comment | withdraw | publish.
 *
 * Permission and rule checks live in src/features/approval/handlers.ts.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    const viewer = viewerFromContext(context)
    if (!viewer) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const url = new URL(request.url)
    const result = await handleReviewGet({
      engine: context.engine as never,
      viewer,
      collection: url.searchParams.get('collection'),
      id: url.searchParams.get('id'),
    })
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-review GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    const viewer = viewerFromContext(context)
    if (!viewer) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body: unknown = await request.json().catch((): null => null)
    const result = await handleReviewPost({
      engine: context.engine as never,
      viewer,
      origin: new URL(request.url).origin,
      body,
    })
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-review POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}