import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { handleReviewQueue } from '@/features/approval/handlers'
import { viewerFromContext } from '@/features/approval/viewer'

export const dynamic = 'force-dynamic'

/** Documents waiting for review that the signed-in user can act on. */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    const viewer = viewerFromContext(context)
    if (!viewer) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const result = await handleReviewQueue({ engine: context.engine as never, viewer })
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-review-queue GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}