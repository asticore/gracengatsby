import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { loadEditPrefs, saveEditPrefs } from '@/admin/editPrefs'

export const dynamic = 'force-dynamic'

/**
 * GET: The current user's collapsed option cards on the edit screen.
 * Returns: { closed: string[] }
 */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()

    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const prefs = await loadEditPrefs(context.engine, context.user)
    return NextResponse.json(prefs, { status: 200 })
  } catch (error) {
    console.error('admin-edit-prefs GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Replace the current user's collapsed option cards.
 * Body: { closed: string[] }
 * Returns: { ok: true, closed: string[] }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()

    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const saved = await saveEditPrefs(context.engine, context.user, body)

    return NextResponse.json({ ok: true, closed: saved.closed }, { status: 200 })
  } catch (error) {
    console.error('admin-edit-prefs POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
