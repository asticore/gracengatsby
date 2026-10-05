import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { signPreviewToken } from '@/utilities/previewToken'

export const dynamic = 'force-dynamic'

/**
 * GET: Generate a signed preview link for a draft document.
 * Query: ?collection=pages|posts&id=N
 *
 * Admin only. Returns a preview URL and expiry time, or 401/400/500 on error.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!(context.isAdmin || context.can('preview-link', 'create'))) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const url = new URL(request.url)
    const collection = url.searchParams.get('collection') ?? ''
    const id = Number(url.searchParams.get('id'))

    // Validate collection
    if (!['pages', 'posts'].includes(collection)) {
      return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
    }

    // Validate id
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Sign the token
    const ttlSeconds = 3600
    const token = await signPreviewToken({ collection, id, ttlSeconds })

    if (!token) {
      return NextResponse.json({ error: 'Preview token generation failed' }, { status: 500 })
    }

    // Build the preview URL
    const baseUrl = new URL(request.url).origin
    const previewUrl = `${baseUrl}/preview/${collection}/${id}?token=${encodeURIComponent(token)}`

    return NextResponse.json(
      {
        url: previewUrl,
        expiresInSeconds: ttlSeconds,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    console.error('preview-link error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
