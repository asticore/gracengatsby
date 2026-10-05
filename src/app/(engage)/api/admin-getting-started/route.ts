import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { saveListPrefs, prefsKey } from '@/admin/list/listPrefs'

export const dynamic = 'force-dynamic'

/**
 * Admin-only getting-started state API.
 * POST JSON {id: string, done: boolean}
 *
 * Stores manual done IDs in preferences collection under the key that load.ts reads.
 * Returns {ok: true} or error.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()

    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    let body: { id?: string; done?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { id, done } = body

    if (!id || typeof done !== 'boolean') {
      return NextResponse.json({ error: 'Missing id or done' }, { status: 400 })
    }

    // Load current done IDs from preferences using the same key that load.ts reads
    const key = prefsKey('getting-started')
    let doneIds: string[] = []
    try {
      const docs = await context.engine.find({
        collection: 'preferences',
        where: { key: { equals: key } },
        limit: 1,
        depth: 0,
        user: context.user,
        overrideAccess: true,
      })
      if (docs && docs.docs && docs.docs.length > 0) {
        const doc = docs.docs[0] as Record<string, unknown>
        const stored = doc.doneIds as unknown
        if (Array.isArray(stored)) {
          doneIds = stored.filter((x: unknown) => typeof x === 'string')
        }
      }
    } catch {
      // New user, no prefs yet
    }

    // Update based on done flag
    if (done && !doneIds.includes(id)) {
      doneIds.push(id)
    } else if (!done) {
      doneIds = doneIds.filter((x) => x !== id)
    }

    // Save back to preferences using same structure and key
    await saveListPrefs(context.engine, context.user, 'getting-started', {
      doneIds,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-getting-started POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
