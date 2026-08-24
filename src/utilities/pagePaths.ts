import type { Page } from '@/engage-types'
import { getEngine } from '@/lib/engine'

const MAX_DEPTH = 8

export type ResolvedPage = { page: Page; path: string[]; ancestors: Page[] }

/**
 * Pages can be nested (parent -> child -> grandchild) so a page's URL isn't
 * just its own slug. Rather than caching a computed full-path column (which
 * would need cascading updates whenever an ancestor's slug changes), we fetch
 * every published page once per request and walk each one's parent chain in
 * memory - simple and correct for a site of this size.
 */
export const getAllResolvedPages = async (): Promise<ResolvedPage[]> => {
  const engine = await getEngine()
  const { docs } = await engine.find({
    collection: 'pages',
    where: { _status: { equals: 'published' } },
    limit: 0,
    depth: 0,
  })

  const byId = new Map<string, Page>()
  docs.forEach((doc) => byId.set(String(doc.id), doc as Page))

  const resolve = (page: Page): ResolvedPage => {
    const path: string[] = []
    const ancestors: Page[] = []
    let current: Page | undefined = page
    let guard = 0

    while (current && guard < MAX_DEPTH) {
      path.unshift(current.slug)
      if (current.id !== page.id) ancestors.unshift(current)
      const parentId = current.parent ? (typeof current.parent === 'object' ? current.parent.id : current.parent) : null
      current = parentId ? byId.get(String(parentId)) : undefined
      guard += 1
    }

    return { page, path, ancestors }
  }

  return docs.map((doc) => resolve(doc as Page))
}

export const findPageByPath = async (segments: string[]): Promise<ResolvedPage | null> => {
  const all = await getAllResolvedPages()
  const wanted = segments.join('/')
  return all.find((entry) => entry.path.join('/') === wanted) || null
}

export const getHomepage = async (): Promise<Page | null> => {
  const engine = await getEngine()
  const { docs } = await engine.find({
    collection: 'pages',
    where: { and: [{ isHomepage: { equals: true } }, { _status: { equals: 'published' } }] },
    limit: 1,
    depth: 2,
  })
  return (docs[0] as Page) || null
}
