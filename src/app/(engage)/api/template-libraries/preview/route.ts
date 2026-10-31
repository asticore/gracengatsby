import { libraryJson, libraryUseAccess, storeEngine } from '@/features/templateLibraries/server'
import { findLibraryItem } from '@/features/templateLibraries/list'
import { loadItemPreview } from '@/features/templateLibraries/loader'
import { SLUG_RE } from '@/features/templateRepos/manifest'

export const dynamic = 'force-dynamic'

/** GET /api/template-libraries/preview?library=<id>&item=<slug>: the item's picture. The bytes decide the type. */
export async function GET(request: Request): Promise<Response> {
  try {
    const access = await libraryUseAccess()
    if (!access.ok) return access.response
    const params = new URL(request.url).searchParams
    const slug = params.get('item') ?? ''
    if (!SLUG_RE.test(slug)) return libraryJson({ ok: false, error: 'That item name is not valid.' }, 400)

    const found = await findLibraryItem(storeEngine(access.context), params.get('library') ?? '')
    if (!found.ok) return libraryJson({ ok: false, error: found.error }, found.status)
    const item = found.manifestItems.find((candidate) => candidate.slug === slug)
    if (!item || !found.row.config) return libraryJson({ ok: false, error: 'That item is not in this library.' }, 404)

    const picture = await loadItemPreview(found.row.config, item)
    if (!picture.ok) return libraryJson({ ok: false, error: picture.error }, 502)
    return new Response(picture.value.bytes as BodyInit, {
      headers: {
        'Content-Type': picture.value.contentType,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('template-libraries preview error:', error instanceof Error ? error.name : 'unknown')
    return libraryJson({ ok: false, error: 'The preview could not be loaded.' }, 500)
  }
}
