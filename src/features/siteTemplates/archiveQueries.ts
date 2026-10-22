import { slugify } from '@/utilities/formatSlug'

/**
 * Pure helpers for the public term archives (/blog/category/[slug]). Posts store categories as an array of
 * { name }, so a category "slug" is the slugified name and matching is done in memory over published posts.
 * Posts have no tags and users have no public name, so tag and author archives have no data to list.
 */

export type ArchivePost = { id?: number | string; slug?: string | null; categories?: { name?: string | null }[] | null }

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
