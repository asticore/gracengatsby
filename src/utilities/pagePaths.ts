import { cache } from 'react'

import type { Page } from '@/engage-types'
import { getEngine } from '@/lib/engine'
import { requestHost } from '@/features/domains/request'
import { availableOnHost, pickForHost } from '@/features/domains/scope'

const MAX_DEPTH = 8

export type ResolvedPage = { page: Page; path: string[]; ancestors: Page[] }

/**
 * Pages can be nested (parent -> child -> grandchild) so a page's URL isn't
 * just its own slug. Rather than caching a computed full-path column (which
 * would need cascading updates whenever an ancestor's slug changes), we fetch
 * every published page once per request and walk each one's parent chain in
 * memory - simple and correct for a site of this size.
 *
 * Domains (features/domains): only the pages this request's domain can show take part. Of pages that share an address,
 * the one scoped to this domain wins over the shared one (pickForHost), and a page whose parent is scoped to another
 * domain has no address here. With no registered host nothing is narrowed.
 *
 * Memoised per request because a single page render asks for this three times
 * over - the root layout builds the nav from it, generateMetadata resolves the
 * path, then the page itself resolves the same path again. Uncached that is
 * three full scans of the pages table, and on Workers each one is its own D1
 * round trip.
 */
export const getAllResolvedPages = cache(async (): Promise<ResolvedPage[]> => {
  const host = await requestHost()
  const engine = await getEngine()
  const { docs } = await engine.find({
    collection: 'pages',
    where: { _status: { equals: 'published' } },
    limit: 0,
    depth: 0,
  })

  const byId = new Map<string, Page>()
  docs.forEach((doc) => byId.set(String(doc.id), doc as unknown as Page))
  const onThisDomain = (page: Page) => availableOnHost((page as { availableDomains?: unknown }).availableDomains, host)

  const resolve = (page: Page): ResolvedPage | null => {
    const path: string[] = []
    const ancestors: Page[] = []
    let current: Page | undefined = page
    let guard = 0

    while (current && guard < MAX_DEPTH) {
      path.unshift(current.slug)
      if (current.id !== page.id) ancestors.unshift(current)
      const parentId = current.parent ? (typeof current.parent === 'object' ? current.parent.id : current.parent) : null
      const next: Page | undefined = parentId ? byId.get(String(parentId)) : undefined
      // A parent that exists but is not on this domain leaves the page without an address here.
      if (next && !onThisDomain(next)) return null
      current = next
      guard += 1
    }

    return { page, path, ancestors }
  }

  const byAddress = new Map<string, ResolvedPage[]>()
  for (const doc of docs as unknown as Page[]) {
    if (!onThisDomain(doc)) continue
    const entry = resolve(doc)
    if (!entry) continue
    const key = entry.path.join('/')
    byAddress.set(key, [...(byAddress.get(key) ?? []), entry])
  }

  const out: ResolvedPage[] = []
  for (const group of byAddress.values()) {
    const picked = pickForHost(group, host, (entry) => (entry.page as { availableDomains?: unknown }).availableDomains)
    if (picked) out.push(picked)
  }
  return out
})

export const findPageByPath = async (segments: string[]): Promise<ResolvedPage | null> => {
  const all = await getAllResolvedPages()
  const wanted = segments.join('/')
  return all.find((entry) => entry.path.join('/') === wanted) || null
}

/** The homepage this request's domain serves: its own homepage, else the shared one. Null when none is on this domain. */
export const getHomepage = async (): Promise<Page | null> => {
  const host = await requestHost()
  const engine = await getEngine()
  const { docs } = await engine.find({
    collection: 'pages',
    where: { and: [{ isHomepage: { equals: true } }, { _status: { equals: 'published' } }] },
    limit: 0,
    depth: 2,
  })
  return pickForHost(docs as unknown as Page[], host, (page) => (page as { availableDomains?: unknown }).availableDomains)
}
