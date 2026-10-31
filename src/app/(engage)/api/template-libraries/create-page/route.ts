import { findLibraryItem } from '@/features/templateLibraries/list'
import { loadItemTemplate } from '@/features/templateLibraries/loader'
import { importItemPictures, libraryJson, libraryPageAccess, slugFromTitle, storeEngine, uniquePageSlug } from '@/features/templateLibraries/server'
import { SLUG_RE } from '@/features/templateRepos/manifest'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_PER_MINUTE = 20

/**
 * POST /api/template-libraries/create-page   { library: string, item: string }
 *
 * Creates a DRAFT page from a library item (never published) and returns the visual editor address for it.
 * The page is created as the signed-in user, so the pages collection's own rules apply.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const access = await libraryPageAccess()
    if (!access.ok) return access.response
    if (hit(`template-libraries-page:${clientKey(request)}`, RATE_LIMIT_PER_MINUTE).limited) {
      return libraryJson({ ok: false, error: 'Too many requests. Wait a minute and try again.' }, 429)
    }
    const body = (await request.json().catch((): null => null)) as Record<string, unknown> | null
    const slug = typeof body?.item === 'string' ? body.item : ''
    if (!SLUG_RE.test(slug)) return libraryJson({ ok: false, error: 'That item name is not valid.' }, 400)

    const found = await findLibraryItem(storeEngine(access.context), typeof body?.library === 'string' ? body.library : '')
    if (!found.ok) return libraryJson({ ok: false, error: found.error }, found.status)
    const item = found.manifestItems.find((candidate) => candidate.slug === slug)
    if (!item || !found.row.config) return libraryJson({ ok: false, error: 'That item is not in this library.' }, 404)

    const template = await loadItemTemplate(found.row.config, item)
    if (!template.ok) return libraryJson({ ok: false, error: template.error }, 502)
    const imported = await importItemPictures(access.context, found.row.config, template.value, `${found.row.url}#${item.file}`, false)
    if (!imported.ok) return libraryJson({ ok: false, error: imported.error }, 422)

    const engine = storeEngine(access.context)
    const pageSlug = await uniquePageSlug(engine, slugFromTitle(item.title))
    const doc = await engine.create({
      collection: 'pages',
      data: { title: item.title, slug: pageSlug, blocks: imported.tree },
      draft: true,
      user: access.context.user,
    })
    const id = String(doc.id)
    return libraryJson({ ok: true, id, slug: pageSlug, status: 'draft', editHref: `/admin/visual-editor/collection/pages/${id}` })
  } catch (error) {
    console.error('template-libraries create-page error:', error instanceof Error ? error.name : 'unknown')
    return libraryJson({ ok: false, error: 'The page could not be created.' }, 500)
  }
}
