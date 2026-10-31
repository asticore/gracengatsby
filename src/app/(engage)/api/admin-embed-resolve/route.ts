import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { resolveShortEmbedUrl } from '@/features/embeds/shortLinks'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin-embed-resolve  { url }
 * The editor calls this when an embed address is pasted: a short link (vm.tiktok.com, pin.it, on.soundcloud.com)
 * comes back as its canonical address; anything else comes back unchanged. The same resolution runs on save, so
 * this is for showing the result early. Signed-in admin users only.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) {
      return NextResponse.json({ ok: false, error: 'You do not have permission to do that.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    }
    const body = (await request.json().catch((): null => null)) as { url?: unknown } | null
    if (!body || typeof body.url !== 'string' || body.url.length > 2048) {
      return NextResponse.json({ ok: false, error: 'Send the address as a text field named url.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
    const result = await resolveShortEmbedUrl(body.url)
    if (result.ok === false) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 422, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ ok: true, url: result.url, changed: result.changed }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-embed-resolve POST error:', error)
    return NextResponse.json({ ok: false, error: 'Something went wrong. Try again.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
