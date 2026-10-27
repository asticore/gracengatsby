import { cache } from 'react'

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

/** One card in an archive grid. Public fields only. `href` is the item's own page. */
export type ArchiveItem = { title: string; href: string; excerpt?: string; date?: unknown; price?: unknown; image?: { url: string; alt?: string } }

/** `basePath` may carry a query (e.g. /shop?category=x); page links add `page` after it. */
export type ArchiveContext = { basePath: string; page: number; pages: number; items: ArchiveItem[] }

// React cache() gives one mutable holder per server request; outside a request it is a fresh object per call.
const holder = cache((): { ctx: BlockContext } => ({ ctx: {} }))

export function setBlockContext(ctx: BlockContext): void {
  holder().ctx = ctx
}

export function getBlockContext(): BlockContext {
  return holder().ctx
}
