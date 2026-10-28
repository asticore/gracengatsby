import Link from 'next/link'
import React from 'react'

import { getBlockContext, type ArchiveFilterValues, type ArchiveItem } from '@/lib/blockContext'
import { getEngine } from '@/lib/engine'
import { excludeProtected } from '@/features/visibility/excludeProtected'
import { paginate } from '@/features/siteTemplates/archiveQueries'
import { NO_ARCHIVE_FILTERS } from '@/features/siteTemplates/archiveFilter'
import { isLoopTemplate, loopItemBlocks, loopItemsFromDocs, parseLoopGridSettings, selectLoopItems, type LoopGridSettings } from '@/features/siteTemplates/loopGrid'
import { renderTemplateBlocks } from '@/features/siteTemplates/render'
import { loadSiteTemplate, prepareTemplateBlocks } from '@/features/siteTemplates/resolve'
import { archivePageHref } from '@/lib/templateWidgets'

/**
 * Loop grid widget: draws the chosen loop template once per item. Items come from the archive being viewed (no
 * source set) or from a bounded scan of published posts, products or events. The same archive filter params the
 * Filter widget writes apply here when the archive is the same kind. Renders nothing on any problem.
 */

type P = Record<string, unknown>

/** Largest scan for an explicit source. Items past it are not listed. */
const SCAN_LIMIT = 300
const SORT_BY_SOURCE: Record<'posts' | 'products' | 'events', string> = { posts: '-publishedDate', products: '-createdAt', events: '-startDate' }

async function scanSource(source: 'posts' | 'products' | 'events'): Promise<ArchiveItem[]> {
  const engine = await getEngine()
  const result = (await engine.find({
    collection: source,
    where: { _status: { equals: 'published' } },
    sort: SORT_BY_SOURCE[source],
    limit: SCAN_LIMIT,
    depth: 1,
  } as never)) as unknown as { docs?: Record<string, unknown>[] }
  const docs = await excludeProtected(source, Array.isArray(result?.docs) ? result.docs : [])
  return loopItemsFromDocs(source, docs as Record<string, unknown>[])
}

/** The items for the settings, before paging. Empty on any problem. */
async function itemsFor(s: LoopGridSettings): Promise<{ items: ArchiveItem[]; ownPaging: boolean }> {
  const archive = getBlockContext().archive
  if (!s.source) {
    // Archive mode: the archive page already filtered and paged its items.
    return { items: archive?.items ?? [], ownPaging: false }
  }
  try {
    const scanned = await scanSource(s.source)
    const sameKind = archive?.kind === s.source
    const filters: ArchiveFilterValues | null = sameKind && archive?.filters ? archive.filters : null
    return { items: selectLoopItems(scanned, s, filters ?? NO_ARCHIVE_FILTERS), ownPaging: true }
  } catch {
    return { items: [], ownPaging: true }
  }
}

type Plan = { blocks: unknown[]; items: ArchiveItem[]; ownPaging: boolean; page: number; pages: number; basePath: string; pagination: boolean; linkCards: boolean; columns: number }

/** Everything the markup needs, gathered before any JSX so a failure renders nothing. */
async function planFor(props: P): Promise<Plan | null> {
  try {
    const s = parseLoopGridSettings(props)
    if (!s.templateId) return null
    const template = await loadSiteTemplate(s.templateId)
    if (!isLoopTemplate(template)) return null
    const blocks = await prepareTemplateBlocks(template as NonNullable<typeof template>)
    if (blocks.length === 0) return null

    const { items: all, ownPaging } = await itemsFor(s)
    const archive = getBlockContext().archive
    // Explicit sources page through their own list; archive mode uses the archive's page and links.
    const paged = ownPaging ? paginate(all, archive?.page ?? 1, s.count) : { items: all, page: 1, pages: 1, total: all.length }
    if (paged.items.length === 0) return null
    return {
      blocks,
      items: paged.items,
      ownPaging,
      page: paged.page,
      pages: paged.pages,
      basePath: archive ? archive.basePath : getBlockContext().path || '/',
      pagination: s.pagination,
      linkCards: s.linkCards,
      columns: s.columns,
    }
  } catch {
    return null
  }
}

export async function LoopGridElement(props: P): Promise<React.ReactElement | null> {
  const plan = await planFor(props)
  if (!plan) return null
  const pager =
    plan.ownPaging && plan.pagination && plan.pages > 1 ? (
      <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
        {plan.page > 1 ? <Link href={archivePageHref(plan.basePath, plan.page - 1)} rel="prev">Previous</Link> : <span />}
        <span className="opacity-60">Page {plan.page} of {plan.pages}</span>
        {plan.page < plan.pages ? <Link href={archivePageHref(plan.basePath, plan.page + 1)} rel="next">Next</Link> : <span />}
      </nav>
    ) : null

  return (
    <div className="loop-grid">
      <div
        className="loop-grid__items"
        style={{ display: 'grid', gap: '1.5rem', listStyle: 'none', padding: 0, margin: 0, gridTemplateColumns: `repeat(${plan.columns}, minmax(0, 1fr))` }}
      >
        {plan.items.map((item) => {
          const body = renderTemplateBlocks(loopItemBlocks(plan.blocks, item))
          return (
            <div key={item.href} className="loop-grid__item">
              {plan.linkCards ? <Link href={item.href} className="loop-grid__link block">{body}</Link> : body}
            </div>
          )
        })}
      </div>
      {pager}
    </div>
  )
}
