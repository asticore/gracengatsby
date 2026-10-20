import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { getAllResolvedPages } from '@/utilities/pagePaths'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash } from '@/cms/db/contentPasswords'

/**
 * Live-search suggestions. Mirrors the sources and URL shapes of the /search results page (pages, posts, products,
 * events), published items only. Password protected pages and posts are left out so a private title never leaks.
 */

export const SUGGEST_MIN_CHARS = 2
export const SUGGEST_MAX_QUERY = 80
export const SUGGEST_MAX_RESULTS = 6
export const SUGGEST_EXCERPT = 120

export type Suggestion = { title: string; url: string; type: string; excerpt: string }

export function normalizeSuggestQuery(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, SUGGEST_MAX_QUERY).trim()
}

export function clipExcerpt(text: unknown, max = SUGGEST_EXCERPT): string {
  const clean = (typeof text === 'string' ? text : '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean
}

const has = (text: unknown, needle: string): boolean => typeof text === 'string' && text.toLowerCase().includes(needle)

type Row = { id?: number | string; title?: string | null; slug?: string | null; excerpt?: string | null; membersOnly?: { enabled?: boolean | null } | null }

/** Members-only content shows only its title in suggestions (the excerpt could hold gated copy). */
const gated = (d: unknown): boolean => Boolean((d as { membersOnly?: { enabled?: unknown } } | null)?.membersOnly?.enabled)

async function isOpen(collection: string, id: unknown): Promise<boolean> {
  const n = Number(id)
  if (!Number.isFinite(n)) return false
  try {
    return !(await getPasswordHash(await getDb(), collection, n))
  } catch {
    return false
  }
}

async function findDocs(collection: string, query: string, fields: string[], sort: string, limit: number): Promise<Row[]> {
  const engine = await getEngine()
  const { docs } = (await engine.find({
    collection,
    where: { and: [{ _status: { equals: 'published' } }, { or: fields.map((f) => ({ [f]: { contains: query } })) }] },
    sort,
    limit,
    depth: 0,
  } as never)) as unknown as { docs: Row[] }
  return docs
}

export async function findSuggestions(rawQuery: unknown, max = SUGGEST_MAX_RESULTS): Promise<Suggestion[]> {
  const query = normalizeSuggestQuery(rawQuery)
  if (query.length < SUGGEST_MIN_CHARS) return []
  const limit = Math.max(1, Math.min(SUGGEST_MAX_RESULTS, Math.floor(max) || SUGGEST_MAX_RESULTS))
  const needle = query.toLowerCase()
  let flags: Awaited<ReturnType<typeof getFeatureFlags>> | null = null
  try {
    flags = await getFeatureFlags()
  } catch {
    flags = null
  }

  const pages = async (): Promise<Suggestion[]> => {
    const out: Suggestion[] = []
    for (const { page, path } of (await getAllResolvedPages()).slice(0, 200)) {
      if (!page.isHomepage && (path.length === 0 || path.some((s) => !s))) continue
      const desc = page.seo?.metaDescription ?? null
      if (!(has(page.title, needle) || has(page.slug, needle) || has(desc, needle))) continue
      if (!(await isOpen('pages', page.id))) continue
      out.push({ title: String(page.title ?? ''), url: page.isHomepage ? '/' : `/${path.join('/')}`, type: 'Page', excerpt: gated(page) ? '' : clipExcerpt(desc) })
      if (out.length >= limit) break
    }
    return out
  }
  const posts = async (): Promise<Suggestion[]> => {
    const docs = await findDocs('posts', query, ['title', 'slug', 'excerpt'], '-publishedDate', limit)
    const out: Suggestion[] = []
    for (const d of docs) {
      if (!d.slug || !(await isOpen('posts', d.id))) continue
      out.push({ title: String(d.title ?? ''), url: `/blog/${d.slug}`, type: 'Post', excerpt: gated(d) ? '' : clipExcerpt(d.excerpt) })
    }
    return out
  }
  const products = async (): Promise<Suggestion[]> =>
    (await findDocs('products', query, ['title', 'slug'], '-createdAt', limit)).filter((d) => d.slug).map((d) => ({ title: String(d.title ?? ''), url: `/shop/${d.slug}`, type: 'Product', excerpt: '' }))
  const events = async (): Promise<Suggestion[]> =>
    (await findDocs('events', query, ['title', 'slug'], '-startDate', limit)).filter((d) => d.slug).map((d) => ({ title: String(d.title ?? ''), url: `/events/${d.slug}`, type: 'Event', excerpt: '' }))

  const none: Suggestion[] = []
  const groups = await Promise.all([
    pages().catch(() => none),
    flags?.blog ? posts().catch(() => none) : none,
    flags?.ecommerce ? products().catch(() => none) : none,
    flags?.events ? events().catch(() => none) : none,
  ])
  return groups.flat().filter((s) => s.title).slice(0, limit)
}
