import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { authorOption, bulkPermissions, isBulkCollection, isEligibleAuthor, type AuthorOption } from '@/features/editScreens/authors'
import { actionRefusal, runBulk, type BulkEngine } from '@/features/editScreens/bulk'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-authors?collection=<slug>
 *   The people who can be made author, for the Author box: { authors: [{ id, name }] }.
 *   Needs an administrator, or a role that can edit other people's work on that collection.
 *
 * POST /api/admin-authors { collection, id, author }
 *   Changes one document's author (the same rule and write as the bulk action).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    const collection = new URL(request.url).searchParams.get('collection')
    if (!isBulkCollection(collection)) return json({ error: 'Choose pages, posts or events.' }, 400)
    if (actionRefusal('changeAuthor', bulkPermissions(context as never, collection))) return json({ error: 'Forbidden' }, 403)

    // The users collection is admin-only to read, so this reads with access off, after the check above.
    const { docs } = await context.engine.find({ collection: 'users', depth: 0, limit: 500, sort: 'name', overrideAccess: true })
    const authors: AuthorOption[] = []
    for (const doc of docs as Array<Record<string, unknown>>) {
      if (!isEligibleAuthor(doc)) continue
      const option = authorOption(doc)
      if (option) authors.push(option)
    }
    return json({ authors })
  } catch (error) {
    console.error('admin-authors GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)

    const body = (await request.json().catch((): null => null)) as { collection?: unknown; id?: unknown; author?: unknown } | null
    const id = Number(body?.id)
    const author = Number(body?.author)
    if (!body || !isBulkCollection(body.collection)) return json({ error: 'Choose pages, posts or events.' }, 400)
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(author) || author <= 0) return json({ error: 'Send the document id and the new author id.' }, 400)

    const refusal = actionRefusal('changeAuthor', bulkPermissions(context as never, body.collection))
    if (refusal) return json({ error: refusal }, 403)

    const target = (await context.engine.findByID({ collection: 'users', id: author, depth: 0, overrideAccess: true }).catch((): null => null)) as Record<string, unknown> | null
    if (!target || !isEligibleAuthor(target)) return json({ error: 'That person cannot be an author.' }, 400)

    const [result] = await runBulk(context.engine as unknown as BulkEngine, context.user, { collection: body.collection, ids: [id], action: 'changeAuthor', author })
    if (!result.ok) return json({ error: result.error ?? 'Could not change the author.' }, 403)
    return json({ ok: true })
  } catch (error) {
    console.error('admin-authors POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
