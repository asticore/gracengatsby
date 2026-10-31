import { findLibraryItem } from '@/features/templateLibraries/list'
import { loadItemTemplate } from '@/features/templateLibraries/loader'
import { importItemPictures, libraryJson, libraryUseAccess } from '@/features/templateLibraries/server'
import { SLUG_RE } from '@/features/templateRepos/manifest'
import { clientKey, hit } from '@/features/security/rateLimit'
import { storeEngine } from '@/features/templateLibraries/server'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_PER_MINUTE = 30

/**
 * POST /api/template-libraries/use   { library: string, item: string, allowRawHtml?: boolean }
 *
 * Returns the item's tree for the visual editor to insert, with its pictures already in the media
 * gallery (reused when the same picture is there). The item is loaded again on the server.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const access = await libraryUseAccess()
    if (!access.ok) return access.response
    if (hit(`template-libraries-use:${clientKey(request)}`, RATE_LIMIT_PER_MINUTE).limited) {
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

    const imported = await importItemPictures(access.context, found.row.config, template.value, `${found.row.url}#${item.file}`, body?.allowRawHtml === true)
    if (!imported.ok) return libraryJson({ ok: false, error: imported.error }, 422)
    return libraryJson({ ok: true, tree: imported.tree, title: item.title, kind: item.kind, saved: imported.saved, reused: imported.reused })
  } catch (error) {
    console.error('template-libraries use error:', error instanceof Error ? error.name : 'unknown')
    return libraryJson({ ok: false, error: 'The template could not be added.' }, 500)
  }
}
