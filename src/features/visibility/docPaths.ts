import { purgeCache } from '@/features/speed/purge'

/**
 * Public URLs of a protected document, for cache purging when its protection changes.
 * Same mapping as the per-document password route: posts under /blog, products under /shop,
 * events under /events (their archive lists change too), pages by slug chain or '/' for the homepage.
 */

type EngineLike = { findByID: (args: any) => Promise<any> }
type Doc = { slug?: string | null; parent?: unknown; isHomepage?: boolean | null } | null

export async function documentPaths(engine: EngineLike, collection: string, id: number): Promise<string[]> {
  const load = async (docId: number | string): Promise<Doc> =>
    (await engine.findByID({ collection, id: docId, depth: 0, overrideAccess: true })) as Doc

  const doc = await load(id)
  if (!doc) return []
  if (collection === 'posts') return doc.slug ? [`/blog/${doc.slug}`] : []
  if (collection === 'products') return doc.slug ? [`/shop/${doc.slug}`, '/shop'] : []
  if (collection === 'events') return doc.slug ? [`/events/${doc.slug}`, '/events'] : []
  if (doc.isHomepage) return ['/']
  const segments: string[] = []
  let current: Doc = doc
  for (let guard = 0; current && guard < 8; guard += 1) {
    if (current.slug) segments.unshift(current.slug)
    const parent = current.parent
    const parentId = parent && typeof parent === 'object' ? (parent as { id?: number | string }).id : (parent as number | string | null)
    current = parentId ? await load(parentId) : null
  }
  return segments.length ? [`/${segments.join('/')}`] : []
}

/**
 * Evicts every affected URL from the caches. Best effort per document: a document that cannot be
 * resolved is skipped, but the whole purge is forced (a protection change must evict the edge copy even
 * when purge-on-publish is off) and never throws.
 */
export async function purgeDocuments(engine: EngineLike, docs: { collection: string; docId: number }[]): Promise<string[]> {
  const paths = new Set<string>()
  for (const { collection, docId } of docs) {
    try {
      for (const path of await documentPaths(engine, collection, docId)) paths.add(path)
    } catch (err) {
      console.error('password group purge: could not resolve document path', err)
    }
  }
  const list = [...paths]
  if (list.length === 0) return list
  try {
    await purgeCache(list, { force: true })
  } catch (err) {
    console.error('password group purge error:', err)
  }
  return list
}
