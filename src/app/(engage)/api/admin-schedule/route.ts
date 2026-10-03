import { NextResponse } from 'next/server'
import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getAdminContext } from '@/admin/auth'
import { getSchedule, setSchedule, clearSchedule } from '@/cms/db/scheduledPublishes'

export const dynamic = 'force-dynamic'

/**
 * GET: Fetch the current schedule for a document.
 * Query: ?collection=<slug>&id=<docId>
 * Returns: { publishAt: ISO string or null, unpublishAt: ISO string or null }
 *
 * PUT: Set or update the schedule for a document.
 * Body: { collection, id, publishAt: ISO string or null, unpublishAt: ISO string or null }
 * Validates: publishAt must be in future when set, unpublishAt after publishAt when both set.
 *
 * DELETE: Clear the schedule for a document.
 * Query: ?collection=<slug>&id=<docId>
 *
 * Admin only.
 */

const ALLOWED_COLLECTIONS = ['pages', 'posts', 'events', 'courses', 'products']

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const url = new URL(request.url)
    const collection = url.searchParams.get('collection') ?? ''
    const id = Number(url.searchParams.get('id'))

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
    }
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const { env } = await getCloudflareContext({ async: true })
    const db = drizzle(env.D1)
    const schedule = await getSchedule(db, collection, id)

    return NextResponse.json(schedule ?? { publishAt: null, unpublishAt: null }, { status: 200 })
  } catch (error) {
    console.error('admin-schedule GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const body: unknown = await request.json().catch((): null => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { collection, id, publishAt, unpublishAt } = body as {
      collection?: unknown
      id?: unknown
      publishAt?: unknown
      unpublishAt?: unknown
    }

    // Validate inputs
    if (!ALLOWED_COLLECTIONS.includes(String(collection))) {
      return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
    }
    if (!Number.isInteger(id) || (id as number) <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Validate dates
    const now = new Date()
    let publishDate: Date | null = null
    let unpublishDate: Date | null = null

    if (publishAt !== null && publishAt !== undefined) {
      publishDate = new Date(String(publishAt))
      if (Number.isNaN(publishDate.getTime())) {
        return NextResponse.json({ error: 'Invalid publishAt date' }, { status: 400 })
      }
      // publishAt must be in the future
      if (publishDate <= now) {
        return NextResponse.json({ error: 'publishAt must be in the future' }, { status: 400 })
      }
    }

    if (unpublishAt !== null && unpublishAt !== undefined) {
      unpublishDate = new Date(String(unpublishAt))
      if (Number.isNaN(unpublishDate.getTime())) {
        return NextResponse.json({ error: 'Invalid unpublishAt date' }, { status: 400 })
      }
      // unpublishAt must be in the future
      if (unpublishDate <= now) {
        return NextResponse.json({ error: 'unpublishAt must be in the future' }, { status: 400 })
      }
      // If both are set, unpublishAt must be after publishAt
      if (publishDate && unpublishDate <= publishDate) {
        return NextResponse.json({ error: 'unpublishAt must be after publishAt' }, { status: 400 })
      }
    }

    const { env } = await getCloudflareContext({ async: true })
    const db = drizzle(env.D1)
    await setSchedule(db, String(collection), id as number, {
      publishAt: publishDate ? publishDate.toISOString() : null,
      unpublishAt: unpublishDate ? unpublishDate.toISOString() : null,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-schedule PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const url = new URL(request.url)
    const collection = url.searchParams.get('collection') ?? ''
    const id = Number(url.searchParams.get('id'))

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
    }
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const { env } = await getCloudflareContext({ async: true })
    const db = drizzle(env.D1)
    await clearSchedule(db, collection, id)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-schedule DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
