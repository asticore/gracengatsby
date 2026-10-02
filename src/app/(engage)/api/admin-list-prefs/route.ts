import { NextResponse } from 'next/server'
import { getAdminContext, getCollectionConfig } from '@/admin/auth'
import { loadListPrefs, resetListPrefs, saveListPrefs } from '@/admin/list/listPrefs'

export const dynamic = 'force-dynamic'

/**
 * POST: Save or update list preferences for a collection.
 * Body: { collection: string, prefs: unknown }
 * Merges with existing prefs so saving only `view` keeps the saved columns.
 * Returns: { ok: true, prefs: ListPrefs }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()

    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    let body: { collection?: unknown; prefs?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { collection: collectionSlug, prefs } = body

    if (typeof collectionSlug !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid collection' }, { status: 400 })
    }

    // Validate that the collection exists
    const collectionConfig = getCollectionConfig(context.engine, collectionSlug)
    if (!collectionConfig) {
      return NextResponse.json({ error: 'Unknown collection' }, { status: 400 })
    }

    const savedPrefs = await saveListPrefs(context.engine, context.user, collectionSlug, prefs)

    return NextResponse.json({ ok: true, prefs: savedPrefs }, { status: 200 })
  } catch (error) {
    console.error('admin-list-prefs POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE: Reset list preferences for a collection.
 * Query: ?collection=<slug>
 * Returns: { ok: true }
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()

    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const url = new URL(request.url)
    const collectionSlug = url.searchParams.get('collection')

    if (!collectionSlug) {
      return NextResponse.json({ error: 'Missing collection query parameter' }, { status: 400 })
    }

    // Validate that the collection exists
    const collectionConfig = getCollectionConfig(context.engine, collectionSlug)
    if (!collectionConfig) {
      return NextResponse.json({ error: 'Unknown collection' }, { status: 400 })
    }

    await resetListPrefs(context.engine, context.user, collectionSlug)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-list-prefs DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
