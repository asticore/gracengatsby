import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { couldApplyToCollection } from '@/features/customFields/location'
import { fetchMediaUrls, loadFieldGroups } from '@/features/customFields/server'

export const dynamic = 'force-dynamic'

/**
 * Normalised Field Group definitions for the admin panel.
 *
 * GET ?collection=<slug>: groups whose location could apply to that collection
 * (the panel then applies the exact location check with the unsaved form values).
 * Without `collection`, every group. Admin panel users only.
 *
 * Replaces the old client-side fetch of /api/field-groups?limit=100, which
 * silently truncated at 100 groups and returned raw rows.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!(context.isAdmin || context.can('field-groups', 'read'))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    }

    const params = new URL(request.url).searchParams

    // ?media=1,2,3 - URLs for media ids the editing panel is showing (for previews).
    const mediaParam = params.get('media')
    if (mediaParam !== null) {
      const ids = mediaParam
        .split(',')
        .map((part) => Number(part))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 200)
      const urls = await fetchMediaUrls(ids)
      return NextResponse.json({ mediaUrls: Object.fromEntries(urls) }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const collection = params.get('collection')
    const groups = await loadFieldGroups()
    const visible = collection && /^[a-z-]+$/.test(collection) ? groups.filter((g) => couldApplyToCollection(g.location, collection)) : groups
    const roles = (context.user as { roles?: unknown } | null)?.roles
    const userRoles = Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : []

    return NextResponse.json({ groups: visible, userRoles }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-field-groups GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}