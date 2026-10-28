import type { ArchiveFilterValues } from '@/lib/blockContext'
import { orderBlogPosts } from '@/features/editScreens/blogOrder'
import { slugify } from '@/utilities/formatSlug'
import { archiveFacets, filterArchiveItems, sortArchiveItems } from './archiveFilter'

/**
 * Pure helpers for the public term archives (/blog/category/[slug]). Posts store categories as an array of
 * { name }, so a category "slug" is the slugified name and matching is done in memory over published posts.
 * Tags are stored the same way ({ name }). Authors are Users with a public slug; only displayName and slug are
 * ever read, never email.
 */

export type ArchivePost = {
  id?: number | string
  slug?: string | null
  categories?: { name?: string | null }[] | null
  tags?: { name?: string | null }[] | null
  author?: unknown
}

export const ARCHIVE_PAGE_SIZE = 9

/** The term slug as stored in URLs, or '' when the raw segment is not a plain slug. */
export function termSlug(raw: string): string {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : ''
}

/** Distinct category names across posts, keyed by slug (first spelling wins). */
export function categoryIndex(posts: ArchivePost[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const post of posts) {
    for (const c of post.categories ?? []) {
      const name = (c?.name ?? '').trim()
      const slug = slugify(name)
      if (slug && !out.has(slug)) out.set(slug, name)
    }
  }
  return out
}

/** Posts that carry the category with this slug (order preserved). */
export function postsInCategory<T extends ArchivePost>(posts: T[], slug: string): T[] {
  if (!termSlug(slug)) return []
  return posts.filter((p) => (p.categories ?? []).some((c) => slugify((c?.name ?? '').trim()) === slug))
}

/** 1-based page from a query value; anything invalid is page 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = v && /^\d{1,6}$/.test(v) ? parseInt(v, 10) : 1
  return n >= 1 ? n : 1
}

export type Paged<T> = { items: T[]; page: number; pages: number; total: number }

/** Slices one page; a page past the end is clamped to the last page. */
export function paginate<T>(items: T[], requested: number, perPage = ARCHIVE_PAGE_SIZE): Paged<T> {
  const size = Math.max(1, Math.floor(perPage))
  const pages = Math.max(1, Math.ceil(items.length / size))
  const page = Math.min(Math.max(1, requested), pages)
  return { items: items.slice((page - 1) * size, page * size), page, pages, total: items.length }
}

/** Public path of a category archive page. */
export function categoryPath(slug: string, page = 1): string {
  return `/blog/category/${slug}${page > 1 ? `?page=${page}` : ''}`
}

/** Distinct tag names across posts, keyed by slug (first spelling wins). */
export function tagIndex(posts: ArchivePost[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const post of posts) {
    for (const t of post.tags ?? []) {
      const name = (t?.name ?? '').trim()
      const slug = slugify(name)
      if (slug && !out.has(slug)) out.set(slug, name)
    }
  }
  return out
}

/** Posts that carry the tag with this slug (order preserved). */
export function postsWithTag<T extends ArchivePost>(posts: T[], slug: string): T[] {
  if (!termSlug(slug)) return []
  return posts.filter((p) => (p.tags ?? []).some((t) => slugify((t?.name ?? '').trim()) === slug))
}

/** Public path of a tag archive page. */
export function tagPath(slug: string, page = 1): string {
  return `/blog/tag/${slug}${page > 1 ? `?page=${page}` : ''}`
}

/** Public path of an author archive page. */
export function authorPath(slug: string, page = 1): string {
  return `/blog/author/${slug}${page > 1 ? `?page=${page}` : ''}`
}

/** The public author of a post: displayName and slug only (email is never read). Null without a populated author with both. */
export function publicAuthor(post: ArchivePost): { name: string; slug: string } | null {
  const a = post.author && typeof post.author === 'object' ? (post.author as { displayName?: unknown; slug?: unknown }) : null
  const name = typeof a?.displayName === 'string' ? a.displayName.trim() : ''
  const slug = typeof a?.slug === 'string' ? a.slug : ''
  return name && termSlug(slug) ? { name, slug } : null
}

/** Distinct public authors across posts, keyed by slug. */
export function authorIndex(posts: ArchivePost[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const post of posts) {
    const a = publicAuthor(post)
    if (a && !out.has(a.slug)) out.set(a.slug, a.name)
  }
  return out
}

/** Posts written by the author with this slug (order preserved). */
export function postsByAuthor<T extends ArchivePost>(posts: T[], slug: string): T[] {
  if (!termSlug(slug)) return []
  return posts.filter((p) => publicAuthor(p)?.slug === slug)
}

/** The fields the archive filters read from a post. Posts keep their identity through the filter and sort. */
type FilterablePost = ArchivePost & { title: string; excerpt?: string | null; publishedDate?: string | null; sticky?: boolean | null }

function postFilterRows<T extends FilterablePost>(posts: T[]) {
  return posts.map((post) => ({
    post,
    title: post.title,
    excerpt: post.excerpt,
    date: post.publishedDate,
    categories: (post.categories ?? []).map((c) => c?.name ?? ''),
    tags: (post.tags ?? []).map((t) => t?.name ?? ''),
  }))
}

/**
 * Posts after the archive filter params (?category=&tag=&q=&sort=). Filters first, then the sort: newest keeps the
 * blog's own order (sticky posts first). With no filter set the list is returned in that same order.
 */
export function filterArchivePosts<T extends FilterablePost>(posts: T[], filters: ArchiveFilterValues): T[] {
  const kept = filterArchiveItems(postFilterRows(posts), filters)
  return filters.sort === 'newest' ? orderBlogPosts(kept.map((k) => k.post)) : sortArchiveItems(kept, filters.sort).map((k) => k.post)
}

/** Choices for the Filter widget, from the unfiltered posts of the archive. */
export function archivePostFacets<T extends FilterablePost>(posts: T[]) {
  return archiveFacets(postFilterRows(posts))
}
