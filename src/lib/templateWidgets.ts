import { formatTagDate } from '@/lib/dynamicTags'

/** Pure helpers for the template widgets (post-meta, breadcrumbs). */

export type Crumb = { label: string; href: string }

const prettify = (seg: string): string => {
  let s = seg
  try { s = decodeURIComponent(seg) } catch { /* keep raw */ }
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Builds crumbs from a URL path. The last crumb uses `currentTitle` when given. Home is always first. */
export function buildBreadcrumbs(path: unknown, currentTitle?: unknown, homeLabel = 'Home'): Crumb[] {
  const clean = typeof path === 'string' ? path.split(/[?#]/)[0] : ''
  const segs = clean.split('/').filter(Boolean)
  const crumbs: Crumb[] = [{ label: homeLabel, href: '/' }]
  let href = ''
  segs.forEach((seg, i) => {
    href += `/${seg}`
    const last = i === segs.length - 1
    const title = typeof currentTitle === 'string' && currentTitle.trim() ? currentTitle.trim() : ''
    crumbs.push({ label: last && title ? title : prettify(seg), href })
  })
  return crumbs
}

/** Joins the enabled meta parts ("By Jo", "20 October 2026", "News, Tips") with a separator. */
export function formatPostMeta(
  post: { author?: unknown; date?: unknown; categories?: unknown },
  opts: { author?: boolean; date?: boolean; categories?: boolean; dateFormat?: 'short' | 'long' } = {},
): string[] {
  const parts: string[] = []
  if (opts.author && typeof post.author === 'string' && post.author.trim()) parts.push(`By ${post.author.trim()}`)
  if (opts.date && post.date) {
    const d = formatTagDate(post.date, opts.dateFormat ?? 'long')
    if (d) parts.push(d)
  }
  if (opts.categories && Array.isArray(post.categories)) {
    const names = post.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    if (names.length) parts.push(names.join(', '))
  }
  return parts
}

/** Address of one page of an archive. Page 1 has no query, so it renders the same address as before paging existed. */
export function archivePageHref(basePath: string, page: number): string {
  if (page <= 1) return basePath
  return `${basePath}${basePath.includes('?') ? '&' : '?'}page=${page}`
}
