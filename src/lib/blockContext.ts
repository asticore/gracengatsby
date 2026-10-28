import { cache } from 'react'

import { localizeForRequest } from '@/features/multilingual/requestLinkLocale'

/** Public page data for dynamic-text tags. Never put private data here: pages are cached for all visitors. */
export type BlockContext = {
  post?: { title?: unknown; date?: unknown; excerpt?: unknown; author?: unknown; featuredImage?: { url?: unknown; alt?: unknown }; categories?: string[] }
  page?: { title?: unknown }
  product?: { id?: number; title?: unknown; price?: unknown; inventory?: number | null; ratingAverage?: number | null; ratingCount?: number | null; featuredImage?: { url?: unknown; alt?: unknown } }
  /** Public event fields. `location` is the venue name and address as one line. */
  event?: { title?: unknown; date?: unknown; location?: unknown; summary?: unknown }
  /** URL path of the page being viewed, for breadcrumbs. */
  path?: string
  /** The archive being viewed (blog, shop, category, tag, author): one page of public items for the archive-grid widget. */
  archive?: ArchiveContext
}

/** One card in an archive grid or a loop. Public fields only. `href` is the item's own page. `type` is the product type or event type. */
export type ArchiveItem = {
  title: string
  href: string
  excerpt?: string
  date?: unknown
  price?: unknown
  image?: { url: string; alt?: string }
  author?: string
  categories?: string[]
  tags?: string[]
  type?: string
}

export type ArchiveSort = 'newest' | 'oldest' | 'title' | 'price-asc' | 'price-desc'

/** The values of the archive filter params (?category=&tag=&min=&max=&q=&sort=). Defaults mean "no filter". */
export type ArchiveFilterValues = { category: string; tag: string; min: number | null; max: number | null; q: string; sort: ArchiveSort }

/** `basePath` may carry a query (e.g. /shop?category=x); page links add `page` after it. */
export type ArchiveContext = {
  basePath: string
  page: number
  pages: number
  items: ArchiveItem[]
  /** Which collection the items come from. A loop with an explicit source applies the filters only when it matches. */
  kind?: 'posts' | 'products'
  /** The active filter values, when the page read any. */
  filters?: ArchiveFilterValues
  /** Choices for the Filter widget, from the unfiltered archive. */
  facets?: { categories: { slug: string; name: string }[]; tags: { slug: string; name: string }[] }
}

// React cache() gives one mutable holder per server request; outside a request it is a fresh object per call.
const holder = cache((): { ctx: BlockContext } => ({ ctx: {} }))

export function setBlockContext(ctx: BlockContext): void {
  holder().ctx = ctx
}

/**
 * The page's public data. On a locale page the archive's item links and base path are
 * localised here, once, so every grid and card that reads the archive links into the locale.
 */
export function getBlockContext(): BlockContext {
  const ctx = holder().ctx
  const archive = ctx.archive
  if (!archive) return ctx
  const localized = archive.items.map((item) => {
    const href = localizeForRequest(item.href)
    return href === item.href ? item : { ...item, href }
  })
  const basePath = localizeForRequest(archive.basePath)
  if (basePath === archive.basePath && localized.every((item, i) => item === archive.items[i])) return ctx
  return { ...ctx, archive: { ...archive, basePath, items: localized } }
}

/** The request's query string (the page's searchParams), so a Loop grid can read its own page number. */
export type RequestQuery = Record<string, string | string[] | undefined>

const queryHolder = cache((): { query: RequestQuery } => ({ query: {} }))

export function setRequestQuery(query: RequestQuery): void {
  queryHolder().query = query && typeof query === 'object' ? query : {}
}

export function getRequestQuery(): RequestQuery {
  return queryHolder().query
}
