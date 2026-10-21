import { cache } from 'react'

/** Public page data for dynamic-text tags. Never put private data here: pages are cached for all visitors. */
export type BlockContext = {
  post?: { title?: unknown; date?: unknown; excerpt?: unknown; author?: unknown; featuredImage?: { url?: unknown; alt?: unknown }; categories?: string[] }
  page?: { title?: unknown }
  product?: { id?: number; title?: unknown; price?: unknown; inventory?: number | null; ratingAverage?: number | null; ratingCount?: number | null }
  /** URL path of the page being viewed, for breadcrumbs. */
  path?: string
}

// React cache() gives one mutable holder per server request; outside a request it is a fresh object per call.
const holder = cache((): { ctx: BlockContext } => ({ ctx: {} }))

export function setBlockContext(ctx: BlockContext): void {
  holder().ctx = ctx
}

export function getBlockContext(): BlockContext {
  return holder().ctx
}
