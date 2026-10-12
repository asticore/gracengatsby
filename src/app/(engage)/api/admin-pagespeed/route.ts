import { NextResponse } from 'next/server'
import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { getAdminContext } from '@/admin/auth'
import { assertDocAccess, docAccessDenied } from '@/features/roles/docAccess'
import { readPageSpeedSettings, resolveDocTarget, testDocument } from '@/features/pagespeed/service'
import { listHistory } from '@/features/pagespeed/store'
import { isPageSpeedCollection, isStrategy, type PageSpeedCollection } from '@/features/pagespeed/types'

export const dynamic = 'force-dynamic'
// A PageSpeed test can take close to a minute; the Google call itself is stopped at 60 s.
export const maxDuration = 90

/**
 * GET  ?collection=<pages|posts|products|events>&id=<docId>
 *      Past results (both strategies, newest first) and whether the document can be tested now.
 * POST { collection, id, strategy: 'mobile' | 'desktop' }
 *      Runs a test against the document's public URL and stores the result.
 *
 * The tested URL is never taken from the request: it is built on the server from the site origin and the
 * document's own slug (see features/pagespeed/target.ts). Needs the "PageSpeed tests" permission plus
 * read (GET) or update (POST) on the document's collection, and own-scope aware.
 */

const noStore = { 'Cache-Control': 'no-store' }

type Ctx = Awaited<ReturnType<typeof getAdminContext>>

const allowed = (context: Ctx, collection: PageSpeedCollection, action: 'read' | 'update'): boolean => {
  if (context.isAdmin) return true
  if (!context.can('admin-pagespeed', action)) return false
  return Boolean(context.permissions.collections?.[collection]?.[action])
}

const parseId = (value: unknown): number | null => {
  const id = typeof value === 'string' ? Number(value) : value
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })

    const url = new URL(request.url)
    const collection = url.searchParams.get('collection')
    const id = parseId(url.searchParams.get('id'))
    if (!isPageSpeedCollection(collection)) return NextResponse.json({ error: 'Invalid collection' }, { status: 400, headers: noStore })
    if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: noStore })
    if (!allowed(context, collection, 'read')) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })

    const access = await assertDocAccess(context, collection, id, 'read')
    if (!access.ok) return docAccessDenied(access)

    const { env } = await getCloudflareContext({ async: true })
    const db = drizzle(env.D1) as never
    const engine = context.engine as never
    const [target, settings, mobile, desktop] = await Promise.all([
      resolveDocTarget(engine, collection, id),
      readPageSpeedSettings(engine),
      listHistory(db, collection, id, 'mobile'),
      listHistory(db, collection, id, 'desktop'),
    ])
    if (!target.found) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })

    return NextResponse.json(
      {
        testable: target.target.ok === true,
        reason: target.target.ok === false ? target.target.reason : null,
        url: target.target.ok === true ? target.target.url : null,
        hasKey: Boolean(settings.apiKey),
        canRun: allowed(context, collection, 'update'),
        results: { mobile, desktop },
      },
      { status: 200, headers: noStore },
    )
  } catch (error) {
    console.error('admin-pagespeed GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: noStore })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })

    const body = (await request.json().catch((): null => null)) as { collection?: unknown; id?: unknown; strategy?: unknown } | null
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: noStore })
    const { collection, strategy } = body
    const id = parseId(body.id)
    if (!isPageSpeedCollection(collection)) return NextResponse.json({ error: 'Invalid collection' }, { status: 400, headers: noStore })
    if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: noStore })
    if (!isStrategy(strategy)) return NextResponse.json({ error: 'Invalid strategy' }, { status: 400, headers: noStore })
    if (!allowed(context, collection, 'update')) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })

    const access = await assertDocAccess(context, collection, id, 'update')
    if (!access.ok) return docAccessDenied(access)

    const { env } = await getCloudflareContext({ async: true })
    const outcome = await testDocument({
      engine: context.engine as never,
      db: drizzle(env.D1) as never,
      collection,
      id,
      strategy,
      source: 'manual',
    })
    if (outcome.ok === false) {
      return NextResponse.json({ error: outcome.message, code: outcome.code }, { status: outcome.status, headers: noStore })
    }
    return NextResponse.json({ result: outcome.result }, { status: 200, headers: noStore })
  } catch (error) {
    console.error('admin-pagespeed POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: noStore })
  }
}