import type { ArchiveFilterValues, ArchiveItem } from '@/lib/blockContext'
import { parseColumns } from '@/lib/sectionTree'
import { slugify } from '@/utilities/formatSlug'
import { filterArchiveItems, NO_ARCHIVE_FILTERS, sortArchiveItems } from './archiveFilter'
import { publicAuthor, type ArchivePost } from './archiveQueries'
import { resolveLoopMergeTags, resolveLoopMergeTagsInRichText, safeLoopLink } from './loopMergeTags'
import type { SiteTemplate } from './types'

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback
}
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback)
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback)

/**
 * Pure helpers for the Loop grid widget (src/components/blocks/elements/LoopGridServer.tsx). A loop grid draws one
 * loop template (site template of kind `loop`) per item. The template's dynamic widgets read the item from a prop
 * (`__loopItem`), not from the page context, so every card shows its own title, image, price and so on.
 */

export const LOOP_SOURCES = ['', 'posts', 'products', 'events'] as const
export type LoopGridSource = (typeof LOOP_SOURCES)[number]
export const LOOP_ORDERS = ['newest', 'oldest', 'title', 'price-asc', 'price-desc'] as const
export type LoopGridOrder = (typeof LOOP_ORDERS)[number]

export type LoopGridSettings = {
  /** Id of the loop template (kind `loop`). Empty = the widget draws nothing. */
  templateId: string
  /** Empty = the items of the archive being viewed. */
  source: LoopGridSource
  category: string
  tag: string
  author: string
  /** Product type (products) or event type (events). */
  type: string
  orderBy: LoopGridOrder
  count: number
  columns: number
  pagination: boolean
  /** The URL parameter that carries this grid's page number (`page` unless the grid sets its own). */
  pageParam: string
  linkCards: boolean
}

/** Props from the page to settings, clamped. Unknown values fall back to the defaults. */
export function parseLoopGridSettings(p: Record<string, unknown>): LoopGridSettings {
  const id = str(p.loopTemplate).trim()
  return {
    templateId: /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : '',
    source: pick(p.source, LOOP_SOURCES, ''),
    category: str(p.category).trim().slice(0, 80),
    tag: str(p.tag).trim().slice(0, 80),
    author: str(p.author).trim().slice(0, 80),
    type: str(p.type).trim().slice(0, 80),
    orderBy: pick(p.orderBy, LOOP_ORDERS, 'newest'),
    count: Math.round(num(p.count, 9, 1, 48)),
    columns: Math.round(num(p.columns, 3, 1, 4)),
    pagination: flag(p.pagination, false),
    pageParam: loopPageParam(p.pageParam),
    linkCards: flag(p.linkCards, true),
  }
}

/** The URL parameter for a grid's page number. Plain words only; anything else is `page`. Give two numbered grids on one page different names (lp2). */
export function loopPageParam(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : ''
  return /^[a-z][a-z0-9_-]{0,23}$/i.test(v) ? v : 'page'
}

/**
 * Link to another page of a grid: the path with every other query param kept (filters, other grids' pages) and this
 * grid's param set to `page`, or removed for page 1.
 */
export function loopPageHref(path: string, query: Record<string, string | string[] | undefined>, param: string, page: number): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === param || value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) q.append(key, v)
  }
  if (page > 1) q.set(param, String(page))
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

/** Page numbers to list around the current one, first and last always in. `null` marks a gap ("..."). */
export function loopPageNumbers(page: number, pages: number, radius = 2): (number | null)[] {
  const keep = new Set<number>([1, pages])
  for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= pages) keep.add(p)
  const out: (number | null)[] = []
  let prev = 0
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push(null)
    out.push(p)
    prev = p
  }
  return out
}

/** A template is usable as a loop item template only when it is a kind `loop` template that is switched on. */
export function isLoopTemplate(t: Pick<SiteTemplate, 'kind' | 'enabled' | 'blocks'> | null | undefined): boolean {
  return !!t && t.kind === 'loop' && t.enabled !== false && Array.isArray(t.blocks) && t.blocks.length > 0
}

/** Text-like elements whose text takes per-item merge tags inside a loop template, and their link props. */
export const LOOP_MERGE_PROPS: Readonly<Record<string, { text: readonly string[]; links: readonly string[] }>> = {
  heading: { text: ['text', 'secondText'], links: ['link'] },
  button: { text: ['text'], links: ['url'] },
  'text-editor': { text: ['content'], links: [] },
}

/** Element types that read `__loopItem` when they are inside a loop template. */
export const LOOP_ITEM_WIDGETS: ReadonlySet<string> = new Set(['post-title', 'post-featured-image', 'post-excerpt', 'post-meta', 'product-price'])

/** The item a widget should draw, or null when it is not inside a loop. */
export function loopItemOf(props: Record<string, unknown> | undefined): ArchiveItem | null {
  const item = props?.__loopItem
  return item && typeof item === 'object' && typeof (item as ArchiveItem).title === 'string' ? (item as ArchiveItem) : null
}

type Node = { blockType?: string; elementType?: string; props?: Record<string, unknown>; columns?: unknown; [key: string]: unknown }

/** Props with the item's merge tags resolved (text, rich text and link props). Other props are kept as they are. */
function mergeProps(props: Record<string, unknown>, item: ArchiveItem, spec: { text: readonly string[]; links: readonly string[] }): Record<string, unknown> {
  const out = { ...props }
  for (const name of spec.text) {
    const value = props[name]
    if (typeof value === 'string') out[name] = resolveLoopMergeTags(value, item)
    else if (value && typeof value === 'object') out[name] = resolveLoopMergeTagsInRichText(value, item)
  }
  for (const name of spec.links) {
    const value = props[name]
    if (typeof value === 'string' && value.includes('{{')) out[name] = safeLoopLink(resolveLoopMergeTags(value, item))
  }
  return out
}

const withItem = (node: Node, item: ArchiveItem): Node => {
  const next: Node = { ...node }
  if (node.blockType === 'element') {
    let props: Record<string, unknown> = node.props ?? {}
    if (LOOP_ITEM_WIDGETS.has(String(node.elementType))) props = { ...props, __loopItem: item }
    const merge = LOOP_MERGE_PROPS[String(node.elementType)]
    if (merge) props = mergeProps(props, item, merge)
    next.props = props
  }
  if (node.blockType === 'section' && Array.isArray(node.columns)) {
    next.columns = parseColumns(node.columns).map((col) => ({
      ...col,
      blocks: (col.blocks ?? []).map((child) => withItem(child as Node, item)),
    }))
  }
  return next
}

/**
 * The loop template's blocks for one item: a copy with the item attached to every item widget (at any depth).
 * The stored template is never changed.
 */
export function loopItemBlocks(blocks: unknown[], item: ArchiveItem): unknown[] {
  return blocks.map((block) => (block && typeof block === 'object' ? withItem(block as Node, item) : block))
}

/** Archive cards for a list of documents of one source. Public fields only, same shape the archive pages use. */
export function loopItemsFromDocs(source: Exclude<LoopGridSource, ''>, docs: Record<string, unknown>[]): ArchiveItem[] {
  return docs.map((doc) => {
    const slug = str(doc.slug)
    const names = (list: unknown): string[] =>
      (Array.isArray(list) ? list : []).map((x) => str(x && typeof x === 'object' ? (x as { name?: unknown }).name : '').trim()).filter(Boolean)
    if (source === 'posts') {
      const image = doc.featuredImage && typeof doc.featuredImage === 'object' ? (doc.featuredImage as { url?: unknown; alt?: unknown }) : null
      const author = publicAuthor(doc as ArchivePost)
      return {
        title: str(doc.title),
        href: `/blog/${slug}`,
        excerpt: str(doc.excerpt) || undefined,
        date: doc.publishedDate,
        image: image && str(image.url) ? { url: str(image.url), alt: str(image.alt) } : undefined,
        author: author?.name,
        categories: names(doc.categories),
        tags: names(doc.tags),
      }
    }
    if (source === 'products') {
      const first = (Array.isArray(doc.images) ? doc.images : []).find((i): i is { url?: unknown; alt?: unknown } => !!i && typeof i === 'object' && !!str((i as { url?: unknown }).url))
      return {
        title: str(doc.title),
        href: `/shop/${slug}`,
        excerpt: str(doc.shortDescription) || undefined,
        price: doc.priceInAUD ?? undefined,
        image: first ? { url: str(first.url), alt: str(first.alt) } : undefined,
        categories: [str(doc.category)].filter(Boolean),
        type: str(doc.productType) || undefined,
      }
    }
    const loc = doc.location && typeof doc.location === 'object' ? (doc.location as { venueName?: unknown }) : {}
    return {
      title: str(doc.title),
      href: `/events/${slug}`,
      excerpt: str(doc.summary) || undefined,
      date: doc.startDate,
      categories: [str(doc.eventType)].filter(Boolean),
      type: str(doc.eventType) || undefined,
      author: str(loc.venueName) || undefined,
    }
  })
}

/**
 * The items a loop grid shows, in order: its own category, tag, author and type settings, then the archive filters
 * from the page (when the archive is the same kind), then the sort. Pure; the caller paginates.
 */
export function selectLoopItems(items: ArchiveItem[], s: LoopGridSettings, archiveFilters: ArchiveFilterValues | null): ArchiveItem[] {
  let out = filterArchiveItems(items, { ...NO_ARCHIVE_FILTERS, category: s.category, tag: s.tag })
  if (archiveFilters) out = filterArchiveItems(out, archiveFilters)
  if (s.author) out = out.filter((item) => !!item.author && slugify(item.author) === slugify(s.author))
  if (s.type) out = out.filter((item) => item.type === s.type)
  return sortArchiveItems(out, s.orderBy)
}
