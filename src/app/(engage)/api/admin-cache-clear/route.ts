import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { bumpCacheEpoch } from '@/features/speed/epoch'
import { purgeCloudflareCache } from '@/features/speed/purge'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin-cache-clear
 * "Clear cache now": starts a new cache version (every saved page copy is
 * ignored from then on) and asks Cloudflare to purge its own copies when a
 * zone and token are saved. Admins, or anyone who may update Speed settings.
 */
export async function POST(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin && !context.can('settings:speed-settings', 'update')) {
      return NextResponse.json({ ok: false, error: 'You do not have permission to clear the cache.' }, { status: 403 })
    }

    const epoch = await bumpCacheEpoch()
    const cloudflare = await purgeCloudflareCache()

    if (epoch === null) {
      return NextResponse.json(
        { ok: false, error: 'The saved copies could not be cleared. Try again in a minute.', cloudflare },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return NextResponse.json({ ok: true, epoch, cloudflare }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-cache-clear POST error:', error)
    return NextResponse.json({ ok: false, error: 'Something went wrong. Try again.' }, { status: 500 })
  }
}