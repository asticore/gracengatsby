import { NextResponse } from 'next/server'

import { adminCan } from '@/features/dataViews/access'
import { SOURCE_COLLECTIONS, buildCatalogue, isSourceCollection } from '@/features/dataViews/catalogue'
import { loadFieldGroups } from '@/features/customFields/server'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store' }

/**
 * The editor's pickers: which collections a view can read, and for one of them every field a view may
 * use, with friendly labels. Only fields in the allow-list come back, so a hidden or private field
 * cannot even be offered. GET ?collection=<slug> (optional).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!(await adminCan('read'))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers })
    const collection = new URL(request.url).searchParams.get('collection')
    const collections = SOURCE_COLLECTIONS.map(({ slug, label, categoryField }) => ({ slug, label, hasCategory: Boolean(categoryField) }))
    if (!collection) return NextResponse.json({ collections }, { headers })
    if (!isSourceCollection(collection)) return NextResponse.json({ error: 'unknown collection' }, { status: 400, headers })
    const groups = await loadFieldGroups()
    return NextResponse.json({ collections, fields: buildCatalogue(collection, groups) }, { headers })
  } catch (error) {
    console.error('admin-data-view-fields GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
