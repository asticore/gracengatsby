import { getEngine } from '@/lib/engine'
import { getAllResolvedPages } from '@/utilities/pagePaths'
import { getFeatureFlags } from '@/utilities/features'

import { getSeoContext, normalisePath, parsePathList, pathMatches } from './settings'

export type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export type SitemapEntry = {
  url: string
  lastModified?: string
  changeFrequency: ChangeFrequency
  priority: number
}

type CollectionRow = { slug?: string | null; updatedAt?: string | null }

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const toW3cDate = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/**
 * Pulls every published, indexable document into one flat list.
 *
 * Each collection is fetched inside its own guard so one unreadable
 * collection - a feature mid-migration, say - costs that collection's entries
 * rather than the whole sitemap.
 */
export const buildSitemapEntries = async (): Promise<SitemapEntry[] | null> => {
  const context = await getSeoContext()
  if (!context.enabled) return null

  const sitemap = context.settings?.sitemap
  if (sitemap?.enabled === false) return null

  const changeFrequency = (sitemap?.changeFrequency || 'weekly') as ChangeFrequency
  const excluded = parsePathList(sitemap?.excludePaths)
  const noindexed = parsePathList(context.settings?.indexing?.noindexPaths)
  const siteBlocked = context.settings?.indexing?.allowIndexing === false

  // Asking a crawler to index nothing and then handing it a list of everything
  // is a contradiction, so a blocked site gets an empty sitemap, not a 404 -
  // the file still exists, it simply lists nothing.
  if (siteBlocked) return []

  const baseUrl = context.baseUrl
  const seen = new Set<string>()
  const entries: SitemapEntry[] = []

  const add = (path: string, lastModified?: string | null, priority = 0.6) => {
    const normalised = normalisePath(path)
    if (seen.has(normalised)) return
    if (pathMatches(normalised, excluded) || pathMatches(normalised, noindexed)) return
    seen.add(normalised)
    entries.push({
      url: normalised === '/' ? `${baseUrl}/` : `${baseUrl}${normalised}`,
      lastModified: toW3cDate(lastModified),
      changeFrequency,
      priority,
    })
  }

  const addCollection = async (collection: string, prefix: string, priority: number) => {
    try {
      const engine = await getEngine()
      const { docs } = await engine.find({
        collection: collection as 'posts',
        where: { _status: { equals: 'published' } },
        limit: 0,
        depth: 0,
      })
      ;(docs as CollectionRow[]).forEach((doc) => {
        if (!doc.slug) return
        add(`${prefix}/${doc.slug}`, doc.updatedAt, priority)
      })
    } catch {
      // A collection that will not read costs its own entries, nothing more.
    }
  }

  add('/', undefined, 1)

  const flags = await getFeatureFlags().catch((): null => null)

  try {
    const pages = await getAllResolvedPages()
    pages.forEach(({ page, path }) => {
      if (page.isHomepage) return
      if (page.seo?.noIndex) return
      add(`/${path.join('/')}`, page.updatedAt, 0.8)
    })
  } catch {
    // Same reasoning as addCollection.
  }

  if (flags?.blog) {
    add('/blog', undefined, 0.7)
    await addCollection('posts', '/blog', 0.6)
  }
  if (flags?.ecommerce) {
    add('/shop', undefined, 0.9)
    await addCollection('products', '/shop', 0.7)
  }
  if (flags?.events) {
    add('/events', undefined, 0.7)
    await addCollection('events', '/events', 0.6)
  }
  if (flags?.faq) {
    add('/faq', undefined, 0.5)
  }

  return entries
}

export const renderSitemapXml = (entries: SitemapEntry[]): string => {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url)}</loc>`]
      if (entry.lastModified) parts.push(`    <lastmod>${entry.lastModified}</lastmod>`)
      parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`)
      parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
