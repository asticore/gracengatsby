import type { ArchiveItem, BlockContext } from '@/lib/blockContext'
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

/**
 * Public author name for a post. Prefers Users.displayName (public name), then name/fullName if present, else the site's business name from site details, else ''. Never reads or returns email.
 */
export function postAuthorName(author: unknown, siteName?: unknown): string {
  const a = author && typeof author === 'object' ? rec(author) : {}
  return str(a.displayName).trim() || str(a.name).trim() || str(a.fullName).trim() || str(siteName).trim()
}

/** First image of a product (depth 1 media doc), public url and alt only. */
function firstImage(images: unknown): { url: unknown; alt: unknown } | undefined {
  for (const item of Array.isArray(images) ? images : []) {
    const img = item && typeof item === 'object' ? rec(item) : null
    if (img && str(img.url)) return { url: img.url, alt: img.alt }
  }
  return undefined
}

/** Context for a post document (depth 1). Shared by /blog/[slug] and the editor's "Preview as". */
export function postBlockContext(post: Record<string, unknown>, path: string, siteName?: string, opts?: { authors?: boolean }): BlockContext {
  const showAuthor = opts?.authors !== false && post.hideAuthor !== true
  const image = post.featuredImage && typeof post.featuredImage === 'object' ? rec(post.featuredImage) : null
  const categories = (Array.isArray(post.categories) ? post.categories : []).map((c) => str(rec(c).name)).filter((n) => !!n)
  return {
    post: {
      title: post.title,
      date: post.publishedDate,
      excerpt: post.excerpt,
      author: (showAuthor ? postAuthorName(post.author, siteName) : '') || undefined,
      featuredImage: image ? { url: image.url, alt: image.alt } : undefined,
      categories,
    },
    path,
  }
}

/** Context for a product document. Shared by /shop/[slug] and "Preview as". */
export function productBlockContext(product: Record<string, unknown>, path: string): BlockContext {
  const image = firstImage(product.images)
  return {
    product: {
      id: product.id as number,
      inventory: product.inventory as number | null | undefined,
      ratingAverage: product.ratingAverage as number | null | undefined,
      ratingCount: product.ratingCount as number | null | undefined,
      title: product.title,
      price: (product.priceInAUD as number | null | undefined) ?? undefined,
      featuredImage: image,
    },
    path,
  }
}

/** Context for an event (public fields only). Shared by /events/[slug] and "Preview as". */
export function eventBlockContext(event: Record<string, unknown>, path: string): BlockContext {
  const loc = rec(event.location)
  const location = [str(loc.venueName), str(loc.address)].filter(Boolean).join(', ')
  return {
    page: { title: event.title },
    event: { title: event.title, date: event.startDate, location: location || undefined, summary: event.summary },
    path,
  }
}

/** Builds the context for a sample item of the given collection. */
export function blockContextFor(collection: 'posts' | 'products' | 'events', doc: Record<string, unknown>, siteName?: string): BlockContext {
  const slug = str(doc.slug)
  if (collection === 'posts') return postBlockContext(doc, `/blog/${slug}`, siteName)
  if (collection === 'products') return productBlockContext(doc, `/shop/${slug}`)
  return eventBlockContext(doc, `/events/${slug}`)
}

/**
 * Sample text a canvas placeholder shows for a server-rendered template widget, or null to keep the
 * generic placeholder. Pure: mirrors what the widgets print from the context.
 */
export function previewTextFor(elementType: string, props: Record<string, unknown>, ctx: BlockContext | null | undefined): string | null {
  if (!ctx) return null
  const title = str(ctx.post?.title) || str(ctx.product?.title) || str(ctx.event?.title) || str(ctx.page?.title)
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
      const img = ctx.post?.featuredImage ?? ctx.product?.featuredImage
      return img && (str(img.alt) || str(img.url)) ? `Image: ${str(img.alt) || str(img.url)}` : null
    }
    case 'product-price': {
      const p = ctx.product?.price
      return p === undefined || p === null || p === '' ? null : formatTagPrice(p) || null
    }
    case 'archive-filter':
      return 'Archive filter: search, category, tag, price and sort'
    case 'loop-grid':
      return props.source ? `Loop grid: ${str(props.source)}` : 'Loop grid: items of the current archive'
    case 'auto-breadcrumbs': {
      if (!ctx.path) return null
      const crumbs = buildBreadcrumbs(ctx.path, title, str(props.homeLabel) || 'Home')
      return crumbs.length >= 2 ? crumbs.map((c) => c.label).join(' / ') : null
    }
    case 'dynamic-text': {
      const html = resolveTags(props.template, { post: rec(ctx.post), page: rec(ctx.page), product: rec(ctx.product), event: rec(ctx.event), site: {} })
      return html.replace(/<[^>]*>/g, '').trim() || null
    }
    default:
      return null
  }
}

/** Names of a list of { name } rows (categories, tags). */
const namesOf = (list: unknown): string[] => (Array.isArray(list) ? list : []).map((x) => str(rec(x).name).trim()).filter(Boolean)

/** Archive cards for posts (public title, link, excerpt, date, featured image, author and category and tag names only). */
export function postArchiveItems(posts: unknown[]): ArchiveItem[] {
  return posts.map((raw) => {
    const post = rec(raw)
    const image = rec(post.featuredImage)
    return {
      title: str(post.title),
      href: `/blog/${str(post.slug)}`,
      excerpt: str(post.excerpt) || undefined,
      date: post.publishedDate,
      image: str(image.url) ? { url: str(image.url), alt: str(image.alt) } : undefined,
      author: str(rec(post.author).displayName).trim() || undefined,
      categories: namesOf(post.categories),
      tags: namesOf(post.tags),
    }
  })
}

/** Archive cards for products (title, link, price and first image). */
export function productArchiveItems(products: unknown[]): ArchiveItem[] {
  return products.map((raw) => {
    const product = rec(raw)
    const image = firstImage(product.images)
    return {
      title: str(product.title),
      href: `/shop/${str(product.slug)}`,
      price: product.priceInAUD ?? undefined,
      image: image && str(image.url) ? { url: str(image.url), alt: str(image.alt) } : undefined,
      type: str(product.productType) || undefined,
    }
  })
}
