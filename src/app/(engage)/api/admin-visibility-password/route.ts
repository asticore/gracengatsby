import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { assertDocAccess, docAccessDenied } from '@/features/roles/docAccess'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash, setPasswordHash, clearPassword } from '@/cms/db/contentPasswords'
import { hashPassword } from '@/features/visibility/password'
import { noteDocumentChanged } from '@/features/dataViews/cache'
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
    type Doc = { slug?: string | null; parent?: unknown; isHomepage?: boolean | null } | null
    const load = async (docId: number | string): Promise<Doc> =>
      (await context.engine.findByID({
        collection: collection as 'pages',
        id: docId as number,
        depth: 0,
        overrideAccess: true,
      })) as Doc

    const doc = await load(id)
    if (!doc) return
    let path = ''
    if (collection === 'posts') {
      if (!doc.slug) return
      path = `/blog/${doc.slug}`
    } else if (doc.isHomepage) {
      path = '/'
    } else {
      // Same walk as utilities/pagePaths: slugs from the root down, max 8 deep.
      const segments: string[] = []
      let current: Doc = doc
      for (let guard = 0; current && guard < 8; guard += 1) {
        if (current.slug) segments.unshift(current.slug)
        const parent = current.parent
        const parentId =
          parent && typeof parent === 'object' ? (parent as { id?: number | string }).id : (parent as number | string | null)
        current = parentId ? await load(parentId) : null
      }
      if (!segments.length) return
      path = `/${segments.join('/')}`
    }
    // force: a password change must evict the edge copy even when purge-on-publish is off.
    await purgeCache(path, { force: true })
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
  if (!(context.isAdmin || context.can('admin-visibility-password', 'update'))) {
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

  const access = await assertDocAccess(context, collection, id, 'update')
  if (!access.ok) return docAccessDenied(access)

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

  if (!process.env.ENGAGE_SECRET) {
    console.error('admin-visibility-password: ENGAGE_SECRET is not set; visitors could never unlock, refusing to set a password')
    return NextResponse.json(
      { error: 'Password protection is unavailable: the server is missing ENGAGE_SECRET. Ask your developer to set it.' },
      { status: 503 },
    )
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

  const access = await assertDocAccess(context, collection, id, 'update')
  if (!access.ok) return docAccessDenied(access)

  try {
    const hash = await hashPassword(password)
    const db = await getDb()
    await setPasswordHash(db, collection, id, hash)

    noteDocumentChanged(collection)
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
  if (!(context.isAdmin || context.can('admin-visibility-password', 'update'))) {
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

  const access = await assertDocAccess(context, collection, id, 'update')
  if (!access.ok) return docAccessDenied(access)

  try {
    const db = await getDb()
    await clearPassword(db, collection, id)

    noteDocumentChanged(collection)
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
