import { getEngine } from '@/lib/engine'
import { getAllResolvedPagesAnyDomain } from '@/utilities/pagePaths'

import { parseHostList } from './scope'

/**
 * The domains that serve their own version of an address, so a shared document at that address is not a page of theirs.
 * Pure rule (shared with the sitemap, sitemap.ts): a domain counts as serving its own document when any document at the
 * address is scoped to it. A document scoped to a domain keeps that domain (its own lists name it), so the caller
 * only has to exclude the others: `availableOnHost(list, d) && (ownHosts.includes(d) || !overridden.has(d))`.
 */
export function overriddenHosts(lists: readonly unknown[]): Set<string> {
  const hosts = new Set<string>()
  for (const list of lists) for (const host of parseHostList(list)) hosts.add(host)
  return hosts
}

/**
 * Lists the documents at a public path (any domain) and returns the hosts that have their own document there.
 * Pages come from the shared page list; blog posts and shop products are looked up by their slug.
 * A failed read answers an empty set, which keeps the current behaviour (every listed domain).
 */
export async function domainOverridesAt(path: string): Promise<Set<string>> {
  const lists: unknown[] = []
  try {
    const pages = await getAllResolvedPagesAnyDomain()
    const wanted = path.replace(/^\/+/, '')
    for (const entry of pages) {
      if (wanted && entry.path.join('/') === wanted) lists.push((entry.page as { availableDomains?: unknown }).availableDomains)
    }
    const match = /^\/(blog|shop)\/([^/]+)$/.exec(path)
    if (match) {
      const collection = match[1] === 'blog' ? 'posts' : 'products'
      const engine = await getEngine()
      const { docs } = await engine.find({
        collection,
        where: { and: [{ slug: { equals: match[2] } }, { availableDomains: { exists: true } }] },
        limit: 0,
        depth: 0,
      })
      for (const doc of docs) lists.push((doc as { availableDomains?: unknown }).availableDomains)
    }
  } catch {
    return new Set()
  }
  return overriddenHosts(lists)
}
