import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { UPLOAD_PREFIX, getUploadBucket } from '@/features/forms/upload'

export const dynamic = 'force-dynamic'

const text = (message: string, status: number): Response =>
  new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-form-file?key=form-uploads/...
 *
 * Serves a file a visitor attached to a form entry, to someone who may read
 * form entries. These files are private: they live under `form-uploads/`, which
 * the public media route refuses (it serves bare file names only), and this is
 * the only way to fetch one. Always sent as a download, never rendered in this
 * site's origin, so an uploaded document cannot run as part of the admin.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return text('Unauthorised', 401)
    if (!context.permissions.collections?.['form-submissions']?.read) return text('Forbidden', 403)

    const key = new URL(request.url).searchParams.get('key') || ''
    if (!key.startsWith(UPLOAD_PREFIX) || key.includes('..') || key.includes('\0') || key.length > 300) return text('Not found', 404)

    const bucket = await getUploadBucket()
    const object = (await bucket.get(key)) as {
      body?: ReadableStream
      httpMetadata?: { contentType?: string }
    } | null
    if (!object?.body) return text('Not found', 404)

    const name = key.split('/').pop() || 'file'
    const safe = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('admin-form-file GET error:', error)
    return text('Internal server error', 500)
  }
}
