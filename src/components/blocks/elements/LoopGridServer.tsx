import Link from 'next/link'
import React from 'react'

import { getBlockContext, getRequestQuery, type ArchiveFilterValues, type ArchiveItem } from '@/lib/blockContext'
import { getEngine } from '@/lib/engine'
import { excludeProtected } from '@/features/visibility/excludeProtected'
import { paginate, parsePage } from '@/features/siteTemplates/archiveQueries'
import { NO_ARCHIVE_FILTERS } from '@/features/siteTemplates/archiveFilter'
import {
  isLoopTemplate,
  loopItemBlocks,
  loopItemsFromDocs,
  loopPageHref,
  loopPageNumbers,
  parseLoopGridSettings,
  selectLoopItems,
  type LoopGridSettings,
} from '@/features/siteTemplates/loopGrid'
import { renderTemplateBlocks } from '@/features/siteTemplates/render'
import { loadSiteTemplate, prepareTemplateBlocks } from '@/features/siteTemplates/resolve'
import { archivePageHref } from '@/lib/templateWidgets'
import { localizeForRequest } from '@/features/multilingual/requestLinkLocale'

/**
 * Loop grid widget: draws the chosen loop template once per item. Items come from the archive being viewed (no
 * source set) or from a bounded scan of published posts, products or events. The same archive filter params the
 * Filter widget writes apply here when the archive is the same kind. A fixed source pages itself: its page number comes
 * from the grid's page parameter (`page` by default) in the request query, and the links keep the other params.
 * Renders nothing on any problem.
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

type Plan = {
  blocks: unknown[]
  items: ArchiveItem[]
  ownPaging: boolean
  page: number
  pages: number
  /** Link to another page of this grid. */
  pageHref: (page: number) => string
  pagination: boolean
  linkCards: boolean
  columns: number
}

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
    const path = getBlockContext().path || '/'
    const query = getRequestQuery()
    // Explicit sources page through their own list, numbered by this grid's param; archive mode uses the archive's page.
    const requested = ownPaging ? (s.pagination ? parsePage(query[s.pageParam]) : 1) : archive?.page ?? 1
    const paged = ownPaging ? paginate(all, requested, s.count) : { items: all, page: 1, pages: 1, total: all.length }
    if (paged.items.length === 0) return null
    return {
      blocks,
      items: paged.items,
      ownPaging,
      page: paged.page,
      pages: paged.pages,
      pageHref: ownPaging
        ? (n: number) => localizeForRequest(loopPageHref(path, query, s.pageParam, n))
        : (n: number) => localizeForRequest(archivePageHref(archive ? archive.basePath : path, n)),
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
  // Numbered pager for a fixed source. Inside an archive the archive's own pager (below the page) is used instead.
  const pager =
    plan.ownPaging && plan.pagination && plan.pages > 1 ? (
      <nav className="mt-8 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
        {plan.page > 1 ? <Link href={plan.pageHref(plan.page - 1)} rel="prev">Previous</Link> : <span />}
        <ul className="flex flex-wrap items-center gap-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {loopPageNumbers(plan.page, plan.pages).map((n, index) =>
            n === null ? (
              <li key={`gap-${index}`}><span className="px-2 opacity-60">...</span></li>
            ) : n === plan.page ? (
              <li key={n}><span aria-current="page" className="px-2 font-semibold">{n}</span></li>
            ) : (
              <li key={n}><Link href={plan.pageHref(n)} className="px-2">{n}</Link></li>
            ),
          )}
        </ul>
        {plan.page < plan.pages ? <Link href={plan.pageHref(plan.page + 1)} rel="next">Next</Link> : <span />}
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
