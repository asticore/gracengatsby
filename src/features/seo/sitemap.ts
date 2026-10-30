import { getEngine } from '@/lib/engine'
import { loadBlogSwitches } from '@/features/blog/switches'
import { authorIndex, categoryIndex, tagIndex, type ArchivePost } from '@/features/siteTemplates/archiveQueries'
import { getFeatureFlags } from '@/utilities/features'
import { isNoIndexedPage, readPasswordGate } from './indexable'
import { excludeProtected } from '@/features/visibility/excludeProtected'
import { readMultilingualSettingsFromD1 } from '@/features/multilingual/settings'
import { getSeoContext, normalisePath, parsePathList, pathMatches } from './settings'
import { sitemapVariants, type Alternate } from './localeSeo'
import { isLocaleRoutable } from '@/features/multilingual/routing'
import { nonDefaultLocales, publishIndex, publishableLocalesForDocument, type PublishIndex } from '@/features/multilingual/availability'
import { findTranslations } from '@/features/multilingual/store'
import { docIdOf, isTranslatableSlugCollection, localizedPath, slugMapFor } from '@/features/multilingual/localizedSlugs'
import { getAllResolvedPages, getHomepage } from '@/utilities/pagePaths'
import { domainAlternates, mergeAlternates } from '@/features/domains/alternates'
import { readDomainsFromD1 } from '@/features/domains/store'
import { requestDomain } from '@/features/domains/request'
import { availableOnHost, parseHostList } from '@/features/domains/scope'
import { isNoindexPath } from '@/features/security/noindex'
import { getAdminRoot } from '@/features/security/settings'

export type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export type SitemapEntry = {
  url: string
  lastModified?: string
  changeFrequency: ChangeFrequency
  priority: number
  /** One per active locale when multilingual is on; omitted otherwise. */
  alternates?: Alternate[]
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
  const adminRoot = await getAdminRoot()
  const multilingual = await readMultilingualSettingsFromD1()
  const seen = new Set<string>()
  const entries: SitemapEntry[] = []
  // Every translation the non-default locales have, in one query. Each entry
  // is then judged in memory, so the sitemap costs one query however long it is.
  const routable = isLocaleRoutable(multilingual)
  // Registered domains: each entry also lists the same page on every other active domain (empty with fewer than two).
  const domains = await readDomainsFromD1()
  // Content limited to other domains is left out of this domain's sitemap.
  const requestHost = (await requestDomain())?.host ?? null
  const translationIndex: PublishIndex = routable
    ? publishIndex(
        await findTranslations((await getEngine()) as unknown as Parameters<typeof findTranslations>[0], {
          locales: nonDefaultLocales(multilingual),
          sourceKind: 'collection',
        }),
      )
    : publishIndex([])

  type DocRef = { collection: string; id: number | string; doc: unknown }
  // Entries are collected first and emitted together, so a document scoped to this domain is seen before the shared one
  // that has the same address, and so hreflang knows where another domain serves its own document.
  const candidates: { path: string; lastModified?: string | null; priority: number; ref?: DocRef }[] = []
  const add = (path: string, lastModified?: string | null, priority = 0.6, ref?: DocRef) => {
    candidates.push({ path, lastModified, priority, ref })
  }
  const emit = (path: string, lastModified?: string | null, priority = 0.6, ref?: DocRef) => {
    const normalised = normalisePath(path)
    if (seen.has(normalised)) return
    // The admin, the API and the preview never belong in a sitemap, whatever the content says.
    if (isNoindexPath(normalised, adminRoot)) return
    if (pathMatches(normalised, excluded) || pathMatches(normalised, noindexed)) return
    const docAvailable = (ref?.doc as { availableDomains?: unknown } | undefined)?.availableDomains
    if (ref && !availableOnHost(docAvailable, requestHost)) return
    seen.add(normalised)
    // A page only lists the locales it has a publishable translation in; a route with no document keeps them all.
    const available = routable && ref
      ? publishableLocalesForDocument({ ...ref, index: translationIndex, settings: multilingual })
      : null
    const localizedPaths = localizedPathsOf(normalised)
    // A domain that serves its own document at this address is not an alternate of a shared one: that is a different page.
    const ownHosts = parseHostList(docAvailable)
    const cross = domainAlternates(
      normalised,
      domains.filter((d) => availableOnHost(docAvailable, d.host) && (ownHosts.includes(d.host) || !scopedAt.get(normalised)?.has(d.host))),
      multilingual,
      localizedPaths,
    )
    for (const variant of sitemapVariants(normalised, baseUrl, multilingual, available, localizedPaths)) {
      const alternates = mergeAlternates(variant.alternates, cross)
      entries.push({
        url: variant.url,
        lastModified: toW3cDate(lastModified),
        changeFrequency,
        priority,
        ...(alternates.length > 0 ? { alternates } : {}),
      })
    }
  }

  // A failed lookup hides the document (fail closed), like llms.txt.
  const isPasswordProtected = async (collection: 'pages' | 'posts', docId: number): Promise<boolean> => {
    try {
      return await readPasswordGate(collection, docId)
    } catch {
      return true
    }
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
      const visible = await excludeProtected(collection as 'posts' | 'products' | 'events', docs as (CollectionRow & { id?: number })[])
      visible.forEach((doc) => {
        if (!doc.slug) return
        const ref = doc.id !== undefined ? { collection, id: doc.id, doc } : undefined
        add(`${prefix}/${doc.slug}`, doc.updatedAt, priority, ref)
      })
    } catch {
      // A collection that will not read costs its own entries, nothing more.
    }
  }

  const home = await getHomepage().catch((): null => null)
  add('/', undefined, 1, home ? { collection: 'pages', id: home.id, doc: home } : undefined)

  const flags = await getFeatureFlags().catch((): null => null)

  try {
    const pages = await getAllResolvedPages()
    for (const { page, path } of pages) {
      if (page.isHomepage) continue
      if (isNoIndexedPage(page)) continue
      // Exclude password-protected pages from sitemap
      if (page.id && (await isPasswordProtected('pages', page.id))) continue
      add(`/${path.join('/')}`, page.updatedAt, 0.8, { collection: 'pages', id: page.id, doc: page })
    }
  } catch {
    // Same reasoning as addCollection.
  }

  if (flags?.blog) {
    add('/blog', undefined, 0.7)
    await addCollection('posts', '/blog', 0.6)
    try {
      const engine = await getEngine()
      const found = await engine.find({ collection: 'posts', where: { _status: { equals: 'published' } }, limit: 0, depth: 1 })
      const docs = await excludeProtected('posts', found.docs as unknown as (ArchivePost & { id?: number })[])
      for (const slug of categoryIndex(docs as ArchivePost[]).keys()) add(`/blog/category/${slug}`, undefined, 0.4)
      const sw = await loadBlogSwitches()
      if (sw.tags) for (const slug of tagIndex(docs as ArchivePost[]).keys()) add(`/blog/tag/${slug}`, undefined, 0.4)
      if (sw.authorArchives) for (const slug of authorIndex(docs as ArchivePost[]).keys()) add(`/blog/author/${slug}`, undefined, 0.4)
    } catch {
      // Category archives are optional entries.
    }
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

  // Translated slugs (localizedSlugs.ts): each entry's URL in every locale, worked out from the rows loaded above.
  const docIdByPath = new Map<string, string>()
  for (const candidate of candidates) {
    if (candidate.ref) docIdByPath.set(normalisePath(candidate.path), docIdOf(candidate.ref.collection, candidate.ref.id))
  }
  const slugDocs = candidates.flatMap((candidate) => {
    const ref = candidate.ref
    if (!ref || !isTranslatableSlugCollection(ref.collection)) return []
    const slug = (ref.doc as { slug?: unknown }).slug
    return typeof slug === 'string' ? [{ sourceId: docIdOf(ref.collection, ref.id), slug }] : []
  })
  const slugMaps = routable
    ? nonDefaultLocales(multilingual).map((locale) => ({
        locale,
        slugs: slugMapFor({ locale, index: translationIndex, settings: multilingual, docs: slugDocs }),
      }))
    : []
  const localizedPathsOf = (path: string): Record<string, string> | undefined => {
    const out: Record<string, string> = {}
    for (const { locale, slugs } of slugMaps) {
      if (slugs.size === 0) continue
      const translated = localizedPath(path, docIdByPath, slugs)
      if (translated !== path) out[locale] = translated
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  const scopedAt = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    const hosts = parseHostList((candidate.ref?.doc as { availableDomains?: unknown } | undefined)?.availableDomains)
    if (hosts.length === 0) continue
    const key = normalisePath(candidate.path)
    scopedAt.set(key, new Set([...(scopedAt.get(key) ?? []), ...hosts]))
  }
  const hereFirst = (ref?: DocRef) => (requestHost && parseHostList((ref?.doc as { availableDomains?: unknown } | undefined)?.availableDomains).includes(requestHost) ? 1 : 0)
  candidates.sort((a, b) => hereFirst(b.ref) - hereFirst(a.ref))
  for (const candidate of candidates) emit(candidate.path, candidate.lastModified, candidate.priority, candidate.ref)

  return entries
}

export const renderSitemapXml = (entries: SitemapEntry[]): string => {
  const hasAlternates = entries.some((entry) => entry.alternates && entry.alternates.length > 0)
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url)}</loc>`]
      if (entry.lastModified) parts.push(`    <lastmod>${entry.lastModified}</lastmod>`)
      parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`)
      parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`)
      for (const alt of entry.alternates ?? []) {
        parts.push(`    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}" />`)
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  const namespaces = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''}`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${namespaces}>\n${urls}\n</urlset>\n`
}
