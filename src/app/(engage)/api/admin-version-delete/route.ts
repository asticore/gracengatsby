import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { deleteVersionRow, isVersionedCollection } from '@/cms/db/versionDelete'

export const dynamic = 'force-dynamic'

/**
 * DELETE: remove one entry from a document's version history.
 * Query: ?collection=<slug>&parent=<document id>&id=<version id>
 *
 * Admin only for now. Task F replaces this check with a permission on a
 * specific role. The latest version (the live document's snapshot) is refused.
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const url = new URL(request.url)
    const collection = url.searchParams.get('collection') ?? ''
    const versionId = Number(url.searchParams.get('id'))
    const parentId = Number(url.searchParams.get('parent'))

    if (!isVersionedCollection(collection)) {
      return NextResponse.json({ error: 'Unknown collection' }, { status: 400 })
    }
    if (!Number.isInteger(versionId) || versionId <= 0 || !Number.isInteger(parentId) || parentId <= 0) {
      return NextResponse.json({ error: 'Invalid id or parent' }, { status: 400 })
    }

    const result = await deleteVersionRow(collection, versionId, parentId)
    if (result === 'deleted') return NextResponse.json({ ok: true }, { status: 200 })
    if (result === 'is_latest') {
      return NextResponse.json({ error: 'The latest version cannot be deleted' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  } catch (error) {
    console.error('admin-version-delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
