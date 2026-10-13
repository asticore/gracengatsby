import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { FIND_REPLACE_LIMITS, parseFindReplace, type FindReplaceCollection } from '@/features/editScreens/findReplace'
import { applyPlan, planFindReplace, type RunEngine } from '@/features/editScreens/findReplaceRun'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_PER_MINUTE = 20

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/admin-find-replace
 *   { mode: 'preview' | 'apply', find, replace, caseSensitive, wholeWord, collections, expect? }
 *
 * preview: counts per place and up to 50 samples. Writes nothing.
 * apply:   changes every match. `expect` must be the match count the person
 *          confirmed from the preview; if the content has moved on since, the
 *          apply is refused and they preview again.
 *
 * Each document is written as the signed-in user with access rules on, so the
 * collection's own rules, locks and hooks still apply per document. Trashed
 * documents are never read. See src/features/editScreens/findReplace.ts.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)

    if (hit(`admin-find-replace:${clientKey(request)}`, RATE_LIMIT_PER_MINUTE).limited) {
      return json({ error: 'Too many searches in a minute. Wait a moment and try again.' }, 429)
    }

    const body = (await request.json().catch((): null => null)) as Record<string, unknown> | null
    if (body?.mode !== 'preview' && body?.mode !== 'apply') return json({ error: 'Choose preview or apply.' }, 400)

    const parsed = parseFindReplace(body)
    if ('error' in parsed) return json({ error: parsed.error }, 400)
    const { options } = parsed

    const can = context.can as unknown as (resource: string, action: string) => boolean
    const refused = options.collections.filter((collection: FindReplaceCollection) => !context.isAdmin && !can(collection, 'update'))
    if (refused.length > 0) {
      return json({ error: `Your role cannot change ${refused.join(', ')}. Ask an administrator.` }, 403)
    }

    const engine = context.engine as unknown as RunEngine
    const plan = await planFindReplace(engine, context.user, options)

    if (body.mode === 'preview') {
      return json({
        mode: 'preview',
        matches: plan.matches,
        documents: plan.documents,
        perCollection: plan.perCollection,
        samples: plan.samples,
        truncated: plan.truncated,
        sampleLimit: FIND_REPLACE_LIMITS.sampleCount,
      })
    }

    // Apply: the person confirmed a specific count. Refuse anything that no longer matches it.
    if (plan.truncated) {
      return json({ error: 'There is too much content to check in one go. Search fewer places.' }, 400)
    }
    if (plan.documents > FIND_REPLACE_LIMITS.applyMaxDocs) {
      return json({ error: `More than ${FIND_REPLACE_LIMITS.applyMaxDocs} items match. Search fewer places or narrow the text.` }, 400)
    }
    if (plan.matches === 0) return json({ mode: 'apply', matches: 0, documents: 0, updated: 0, refused: 0, rows: [], message: 'Nothing matched, so nothing was changed.' })
    if (body.expect !== plan.matches) {
      return json({ error: 'The content has changed since the preview. Preview again before replacing.' }, 409)
    }

    const rows = await applyPlan(engine, context.user, plan)
    const updated = rows.filter((row) => row.ok).length
    const refusedCount = rows.length - updated
    return json({
      mode: 'apply',
      matches: plan.matches,
      documents: plan.documents,
      updated,
      refused: refusedCount,
      rows,
      message: refusedCount === 0 ? `${plan.matches} ${plan.matches === 1 ? 'match' : 'matches'} replaced in ${updated} ${updated === 1 ? 'item' : 'items'}.` : `${updated} updated, ${refusedCount} refused.`,
    })
  } catch (error) {
    console.error('admin-find-replace POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
