import type { ArchiveFilterValues, ArchiveSort } from '@/lib/blockContext'
import { slugify } from '@/utilities/formatSlug'

/**
 * Pure helpers for the archive filter params shared by the Filter widget, the archive pages (blog, shop) and the
 * Loop grid. Filters are read from the query string on the server and applied in memory to a bounded set of
 * published items, so the result is the same whether a visitor or a crawler loads the page. No param = no filter.
 */

export const ARCHIVE_SORTS: readonly ArchiveSort[] = ['newest', 'oldest', 'title', 'price-asc', 'price-desc']

export const NO_ARCHIVE_FILTERS: ArchiveFilterValues = { category: '', tag: '', min: null, max: null, q: '', sort: 'newest' }

type Raw = Record<string, string | string[] | undefined>

const one = (raw: string | string[] | undefined): string => {
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' ? v : ''
}

/** A money value: digits with at most two decimals. Anything else is no bound. */
function money(raw: string | string[] | undefined): number | null {
  const v = one(raw).trim()
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) return null
  return Number(v)
}

/** Reads the filter params. Unknown sort values fall back to newest; text is trimmed and length-capped. */
export function parseArchiveFilters(params: Raw): ArchiveFilterValues {
  const sort = one(params.sort).trim()
  return {
    category: one(params.category).trim().slice(0, 80),
    tag: one(params.tag).trim().slice(0, 80),
    min: money(params.min),
    max: money(params.max),
    q: one(params.q).trim().slice(0, 100),
    sort: (ARCHIVE_SORTS as readonly string[]).includes(sort) ? (sort as ArchiveSort) : 'newest',
  }
}

/** True when any filter is set (a non-default sort counts). */
export function isArchiveFilterActive(f: ArchiveFilterValues): boolean {
  return f.category !== '' || f.tag !== '' || f.min !== null || f.max !== null || f.q !== '' || f.sort !== 'newest'
}

/** The query string for the active values (without `page`), or '' when nothing is set. */
export function archiveQueryString(f: ArchiveFilterValues): string {
  const q = new URLSearchParams()
  if (f.category) q.set('category', f.category)
  if (f.tag) q.set('tag', f.tag)
  if (f.min !== null) q.set('min', String(f.min))
  if (f.max !== null) q.set('max', String(f.max))
  if (f.q) q.set('q', f.q)
  if (f.sort !== 'newest') q.set('sort', f.sort)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** An item the filters can look at. Fields are optional so posts, products and events share one shape. */
export type FilterableItem = {
  title: string
  excerpt?: string | null
  price?: unknown
  date?: unknown
  categories?: string[] | null
  tags?: string[] | null
}

const same = (a: string, b: string): boolean => slugify(a.trim()) === slugify(b.trim())

const priceOf = (raw: unknown): number | null => {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  return Number.isFinite(n) ? n : null
}

const timeOf = (raw: unknown): number => {
  if (raw === undefined || raw === null || raw === '') return 0
  const t = new Date(raw as string | number | Date).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Keeps the items that match every active filter. Category and tag compare slugs, so "Gift Ideas" matches "gift-ideas". */
export function filterArchiveItems<T extends FilterableItem>(items: T[], f: ArchiveFilterValues): T[] {
  const needle = f.q.toLowerCase()
  return items.filter((item) => {
    if (f.category && !(item.categories ?? []).some((c) => same(c, f.category))) return false
    if (f.tag && !(item.tags ?? []).some((t) => same(t, f.tag))) return false
    if (f.min !== null || f.max !== null) {
      const p = priceOf(item.price)
      if (p === null) return false
      if (f.min !== null && p < f.min) return false
      if (f.max !== null && p > f.max) return false
    }
    if (needle && !`${item.title} ${item.excerpt ?? ''}`.toLowerCase().includes(needle)) return false
    return true
  })
}

/** Sorts a copy. Newest and oldest use the date, title is A to Z, price sorts put items without a price last. */
export function sortArchiveItems<T extends FilterableItem>(items: T[], sort: ArchiveSort): T[] {
  const copy = [...items]
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => timeOf(a.date) - timeOf(b.date))
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title))
    case 'price-asc':
    case 'price-desc': {
      const dir = sort === 'price-asc' ? 1 : -1
      return copy.sort((a, b) => {
        const pa = priceOf(a.price)
        const pb = priceOf(b.price)
        if (pa === null || pb === null) return pa === null && pb === null ? 0 : pa === null ? 1 : -1
        return (pa - pb) * dir
      })
    }
    default:
      return copy.sort((a, b) => timeOf(b.date) - timeOf(a.date))
  }
}

/** Distinct category and tag names (first spelling wins), sorted by name, for the Filter widget's choices. */
export function archiveFacets(items: { categories?: string[] | null; tags?: string[] | null }[]): {
  categories: { slug: string; name: string }[]
  tags: { slug: string; name: string }[]
} {
  const collect = (pick: (i: (typeof items)[number]) => string[] | null | undefined) => {
    const out = new Map<string, string>()
    for (const item of items) {
      for (const raw of pick(item) ?? []) {
        const name = raw.trim()
        const slug = slugify(name)
        if (slug && !out.has(slug)) out.set(slug, name)
      }
    }
    return [...out.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name))
  }
  return { categories: collect((i) => i.categories), tags: collect((i) => i.tags) }
}
