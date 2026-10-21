import type { BlockContext } from '@/lib/blockContext'
import { formatTagDate, formatTagPrice, resolveTags } from '@/lib/dynamicTags'
import { buildBreadcrumbs } from '@/lib/templateWidgets'

/** The collection a site-template kind previews with, or null when it has no single item (header, footer, archives, 404). */
export function sampleCollectionFor(kind: unknown): 'posts' | 'products' | 'events' | null {
  if (kind === 'single-post') return 'posts'
  if (kind === 'single-product') return 'products'
  if (kind === 'single-event') return 'events'
  return null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** Context for a post document (depth 1). Shared by /blog/[slug] and the editor's "Preview as". */
export function postBlockContext(post: Record<string, unknown>, path: string): BlockContext {
  const image = post.featuredImage && typeof post.featuredImage === 'object' ? rec(post.featuredImage) : null
  const author = post.author && typeof post.author === 'object' ? rec(post.author) : null
  const categories = (Array.isArray(post.categories) ? post.categories : []).map((c) => str(rec(c).name)).filter((n) => !!n)
  return {
    post: {
      title: post.title,
      date: post.publishedDate,
      excerpt: post.excerpt,
      author: author?.name,
      featuredImage: image ? { url: image.url, alt: image.alt } : undefined,
      categories,
    },
    path,
  }
}

/** Context for a product document. Shared by /shop/[slug] and "Preview as". */
export function productBlockContext(product: Record<string, unknown>, path: string): BlockContext {
  return {
    product: {
      id: product.id as number,
      inventory: product.inventory as number | null | undefined,
      ratingAverage: product.ratingAverage as number | null | undefined,
      ratingCount: product.ratingCount as number | null | undefined,
      title: product.title,
      price: (product.priceInAUD as number | null | undefined) ?? undefined,
    },
    path,
  }
}

/** Context for an event: only its title and path are read by the widgets. */
export function eventBlockContext(event: Record<string, unknown>, path: string): BlockContext {
  return { page: { title: event.title }, path }
}

/** Builds the context for a sample item of the given collection. */
export function blockContextFor(collection: 'posts' | 'products' | 'events', doc: Record<string, unknown>): BlockContext {
  const slug = str(doc.slug)
  if (collection === 'posts') return postBlockContext(doc, `/blog/${slug}`)
  if (collection === 'products') return productBlockContext(doc, `/shop/${slug}`)
  return eventBlockContext(doc, `/events/${slug}`)
}

/**
 * Sample text a canvas placeholder shows for a server-rendered template widget, or null to keep the
 * generic placeholder. Pure: mirrors what the widgets print from the context.
 */
export function previewTextFor(elementType: string, props: Record<string, unknown>, ctx: BlockContext | null | undefined): string | null {
  if (!ctx) return null
  const title = str(ctx.post?.title) || str(ctx.product?.title) || str(ctx.page?.title)
  switch (elementType) {
    case 'post-title':
      return title || null
    case 'post-meta': {
      const parts = [ctx.post?.date ? formatTagDate(ctx.post.date, 'long') : '', str(ctx.post?.author), (ctx.post?.categories ?? []).join(', ')].filter(Boolean)
      return parts.length ? parts.join(' · ') : null
    }
    case 'post-excerpt':
      return str(ctx.post?.excerpt) || null
    case 'post-featured-image': {
      const img = ctx.post?.featuredImage
      return img && (str(img.alt) || str(img.url)) ? `Image: ${str(img.alt) || str(img.url)}` : null
    }
    case 'product-price': {
      const p = ctx.product?.price
      return p === undefined || p === null || p === '' ? null : formatTagPrice(p) || null
    }
    case 'breadcrumbs': {
      if (!ctx.path) return null
      const crumbs = buildBreadcrumbs(ctx.path, title, str(props.homeLabel) || 'Home')
      return crumbs.length >= 2 ? crumbs.map((c) => c.label).join(' / ') : null
    }
    case 'dynamic-text': {
      const html = resolveTags(props.template, { post: rec(ctx.post), page: rec(ctx.page), product: rec(ctx.product), site: {} })
      return html.replace(/<[^>]*>/g, '').trim() || null
    }
    default:
      return null
  }
}
