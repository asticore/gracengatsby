import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash, setPasswordHash, clearPassword } from '@/cms/db/contentPasswords'
import { hashPassword } from '@/features/visibility/password'
import { purgeCache } from '@/features/speed/purge'

export const dynamic = 'force-dynamic'

const ALLOWED_COLLECTIONS = new Set(['pages', 'posts'])
const MIN_PASSWORD_LENGTH = 4

/**
 * Best-effort cache purge for the document's public URL, so a page already in
 * the shared page cache stops being served once its password changes.
 */
async function purgeDocument(
  context: Awaited<ReturnType<typeof getAdminContext>>,
  collection: string,
  id: number,
  label: string,
): Promise<void> {
  try {
    const doc = (await context.engine.findByID({
      collection: collection as 'pages',
      id,
      depth: 0,
      overrideAccess: true,
    })) as { path?: string | null; slug?: string | null } | null
    const raw = doc?.path || (doc?.slug ? `/${doc.slug}` : '')
    if (!raw) return
    await purgeCache(raw.startsWith('/') ? raw : `/${raw}`)
  } catch (err) {
    console.error(`admin-visibility-password ${label} purgeCache error:`, err)
    // Never fail the request because of the purge
  }
}

/**
 * GET: Check if a document has a password set.
 * Query: ?collection=<slug>&id=<document id>
 *
 * Response: {hasPassword: boolean}
 */
async function handleGet(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!(context.isAdmin || context.can('admin-visibility-password', 'read'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const url = new URL(request.url)
  const collection = url.searchParams.get('collection') ?? ''
  const id = Number(url.searchParams.get('id'))

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
  }
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const db = await getDb()
    const hash = await getPasswordHash(db, collection, id)
    return NextResponse.json({ hasPassword: hash !== null }, { status: 200 })
  } catch (error) {
    console.error('admin-visibility-password GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST: Set a password for a document.
 * Body: JSON {collection, id, password}
 *
 * Validates: collection is pages|posts, id is positive integer, password is at least 4 chars.
 * Hashes the password with PBKDF2 and stores it.
 * Never returns the hash in the response.
 */
async function handlePost(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!(context.isAdmin || context.can('admin-visibility-password', 'update'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  let body: { collection?: unknown; id?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { collection, id, password } = body

  if (typeof collection !== 'string' || !ALLOWED_COLLECTIONS.has(collection)) {
    return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
  }
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
  }

  try {
    const hash = await hashPassword(password)
    const db = await getDb()
    await setPasswordHash(db, collection, id, hash)

    await purgeDocument(context, collection, id, 'POST')

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-visibility-password POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE: Clear the password for a document.
 * Query: ?collection=<slug>&id=<document id>
 */
async function handleDelete(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!(context.isAdmin || context.can('admin-visibility-password', 'delete'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const url = new URL(request.url)
  const collection = url.searchParams.get('collection') ?? ''
  const id = Number(url.searchParams.get('id'))

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
  }
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const db = await getDb()
    await clearPassword(db, collection, id)

    await purgeDocument(context, collection, id, 'DELETE')

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-visibility-password DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleGet(request)
}

export async function POST(request: Request): Promise<Response> {
  return handlePost(request)
}

export async function DELETE(request: Request): Promise<Response> {
  return handleDelete(request)
}
