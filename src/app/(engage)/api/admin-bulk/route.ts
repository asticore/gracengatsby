import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { bulkPermissions, isEligibleAuthor } from '@/features/editScreens/authors'
import { actionRefusal, parseBulkRequest, runBulk, summariseResults, type BulkEngine } from '@/features/editScreens/bulk'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/admin-bulk
 *   { collection: 'pages' | 'posts' | 'events', ids: number[], action, author?, category? }
 *   action: publish | unpublish | trash | restore | delete | changeAuthor | changeCategory
 *
 * Answers `{ message, results: [{ id, ok, error? }] }`. The action's own permission is checked once
 * up front (403 for the whole request); after that every row is written as the signed-in user with
 * access rules on, so a row the user may not change (not theirs, locked, published and they cannot
 * publish) fails on its own and the others still go ahead. See src/features/editScreens/bulk.ts.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)

    const parsed = parseBulkRequest(await request.json().catch((): null => null))
    if ('error' in parsed) return json({ error: parsed.error }, 400)
    const { request: bulk } = parsed

    const permissions = bulkPermissions(context as never, bulk.collection)
    const refusal = actionRefusal(bulk.action, permissions)
    if (refusal) return json({ error: refusal }, 403)

    if (bulk.action === 'changeAuthor' && bulk.author !== undefined) {
      const author = (await context.engine
        .findByID({ collection: 'users', id: bulk.author, depth: 0, overrideAccess: true })
        .catch((): null => null)) as Record<string, unknown> | null
      if (!author || !isEligibleAuthor(author)) return json({ error: 'That person cannot be an author.' }, 400)
    }

    const results = await runBulk(context.engine as unknown as BulkEngine, context.user, bulk)
    return json({ message: summariseResults(results), results })
  } catch (error) {
    console.error('admin-bulk POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
