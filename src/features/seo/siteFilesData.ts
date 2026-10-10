import { cache } from 'react'
import { sql } from 'drizzle-orm'

import { getDb } from '@/cms/db/connect'
import { getEngine } from '@/lib/engine'
import { getAllResolvedPages } from '@/utilities/pagePaths'
import { getFeatureFlags } from '@/utilities/features'

import { isNoIndexedPage } from './indexable'
import { absoluteUrl, getSeoContext, mediaUrl, parsePathList, pathMatches } from './settings'
import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildManifest,
  buildPlainTextFile,
  buildSecurityTxt,
  parseBlockedPaths,
  richTextToText,
  type LlmsItem,
  type LlmsSection,
  type SiteFilesSettings,
  type WebManifest,
} from './siteFiles'

/**
 * Gathers what the site-file builders need from the database and renders each
 * file. Every renderer returns null when the file must not be served; the route
 * handlers turn that into a 404.
 *
 * Every renderer also returns null when the SEO feature is off, in line with
 * robots.txt and sitemap.xml: one switch controls all the search-facing files.
 */

type CollectionName = 'pages' | 'posts' | 'products' | 'events'

const DEFAULT_COLLECTIONS: CollectionName[] = ['pages', 'posts']
const COLLECTION_ORDER: CollectionName[] = ['pages', 'posts', 'products', 'events']
const HEADINGS: Record<CollectionName, string> = {
  pages: 'Pages',
  posts: 'Posts',
  products: 'Products',
  events: 'Events',
}
/** The public address prefix each non-page collection is served under. */
const PREFIXES: Record<Exclude<CollectionName, 'pages'>, string> = {
  posts: '/blog',
  products: '/shop',
  events: '/events',
}
/** Hard ceiling on items in llms.txt, so one huge catalogue cannot blow the file up. */
const MAX_ITEMS = 2000

type FileContext = {
  enabled: boolean
  settings: SiteFilesSettings
  baseUrl: string
  siteName: string
  /** Paths to keep out of llms.txt: the exclusion list, noindex paths and blocked paths. */
  excluded: string[]
}

type IconUrls = { favicon?: string; logo?: string }

const readContext = async (): Promise<FileContext> => {
  const context = await getSeoContext()
  const raw = (context.settings ?? null) as unknown as { siteFiles?: SiteFilesSettings; indexing?: { noindexPaths?: string | null } } | null
  const settings = raw?.siteFiles ?? {}
  const blocked = parseBlockedPaths(settings.serverBlockedPaths).paths
  return {
    enabled: context.enabled,
    settings,
    baseUrl: context.baseUrl,
    siteName: context.siteName,
    excluded: [
      ...parsePathList(settings.llmsExcludePaths),
      ...parsePathList(raw?.indexing?.noindexPaths),
      ...blocked,
    ],
  }
}

/** Icon URLs from Site settings. Read once per request; never throws. */
export const getSiteIcons = cache(async (): Promise<IconUrls> => {
  try {
    const engine = await getEngine()
    const site = (await engine.findGlobal({ slug: 'site-settings', depth: 1 })) as {
      favicon?: unknown
      logo?: unknown
    } | null
    return {
      favicon: mediaUrl(site?.favicon as Parameters<typeof mediaUrl>[0]),
      logo: mediaUrl(site?.logo as Parameters<typeof mediaUrl>[0]),
    }
  } catch {
    return {}
  }
})

/**
 * The ids of the password-protected documents in one collection, read with a
 * single query. Returns null when the query fails; the caller then treats every
 * document in that collection as protected, so a file that lists content never
 * exposes a gated page just because the check broke.
 */
const protectedIds = async (collection: 'pages' | 'posts'): Promise<Set<number> | null> => {
  try {
    const db = await getDb()
    const rows = (await db.all(
      sql`SELECT doc_id FROM \`eg_content_passwords\` WHERE collection = ${collection}`,
    )) as { doc_id: number }[]
    return new Set(rows.map((row) => Number(row.doc_id)))
  } catch {
    return null
  }
}

/** Whether a document is hidden by its password, given that collection's protected set. */
const isGated = (gated: Set<number> | null, id: number | undefined): boolean => {
  if (gated === null) return true
  return id !== undefined && gated.has(id)
}

type LooseDoc = {
  id?: number
  title?: string | null
  slug?: string | null
  updatedAt?: string | null
  excerpt?: string | null
  summary?: string | null
  shortDescription?: string | null
  description?: unknown
  content?: unknown
  blocks?: unknown
  isHomepage?: boolean | null
  seo?: { noIndex?: boolean | null; metaDescription?: string | null } | null
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Builds the llms.txt sections from the published documents, applying the same
 * visibility rules as the sitemap: published only, no noindex, no password
 * gate, and nothing under an excluded or blocked path.
 */
const collectSections = async (ctx: FileContext, withBodies: boolean): Promise<LlmsSection[]> => {
  const chosen = ctx.settings.llmsIncludeCollections?.length ? ctx.settings.llmsIncludeCollections : DEFAULT_COLLECTIONS
  const include = new Set<string>(chosen)
  const flags = await getFeatureFlags().catch((): null => null)
  const allowed = (collection: CollectionName): boolean => {
    if (collection === 'pages') return true
    if (collection === 'posts') return Boolean(flags?.blog)
    if (collection === 'products') return Boolean(flags?.ecommerce)
    return Boolean(flags?.events)
  }

  const sections: LlmsSection[] = []
  let total = 0
  const keep = (path: string): boolean => !pathMatches(path, ctx.excluded)
  const absolute = (path: string): string => `${ctx.baseUrl}${path}`

  for (const collection of COLLECTION_ORDER) {
    if (!include.has(collection) || !allowed(collection)) continue
    if (total >= MAX_ITEMS) break

    const items: LlmsItem[] = []

    if (collection === 'pages') {
      try {
        const gated = await protectedIds('pages')
        for (const { page, path } of await getAllResolvedPages()) {
          const doc = page as unknown as LooseDoc
          if (isNoIndexedPage(doc)) continue
          const url = doc.isHomepage ? '/' : `/${path.join('/')}`
          if (!keep(url)) continue
          if (isGated(gated, doc.id)) continue
          items.push({
            title: clean(doc.title) || url,
            url: absolute(url),
            description: clean(doc.seo?.metaDescription),
            body: withBodies ? richTextToText(doc.blocks ?? doc.content) : undefined,
          })
          if (++total >= MAX_ITEMS) break
        }
      } catch {
        // Pages that will not read cost their own entries only.
      }
    } else {
      try {
        // Only posts can be password-protected; the other collections skip the lookup.
        const gated = collection === 'posts' ? await protectedIds('posts') : new Set<number>()
        const engine = await getEngine()
        const { docs } = await engine.find({
          collection: collection as 'posts',
          where: { _status: { equals: 'published' } },
          limit: 0,
          depth: 0,
        })
        for (const raw of docs as LooseDoc[]) {
          if (!raw.slug) continue
          if (isNoIndexedPage(raw)) continue
          const url = `${PREFIXES[collection]}/${raw.slug}`
          if (!keep(url)) continue
          if (isGated(gated, raw.id)) continue
          const summary = clean(raw.excerpt) || clean(raw.summary) || clean(raw.shortDescription)
          const bodySource = raw.content ?? raw.description
          items.push({
            title: clean(raw.title) || url,
            url: absolute(url),
            description: summary,
            body: withBodies ? richTextToText(bodySource) : undefined,
          })
          if (++total >= MAX_ITEMS) break
        }
      } catch {
        // A collection that will not read costs its own entries only.
      }
    }

    sections.push({ heading: HEADINGS[collection], items })
  }

  return sections
}

const llmsInput = async (ctx: FileContext, withBodies: boolean) => ({
  title: clean(ctx.settings.llmsTitle) || ctx.siteName || 'Site',
  summary: ctx.settings.llmsSummary,
  sections: await collectSections(ctx, withBodies),
})

/** llms.txt, or null when it is switched off or the SEO feature is off. */
export const renderLlmsTxt = async (): Promise<string | null> => {
  const ctx = await readContext()
  if (!ctx.enabled || ctx.settings.llmsEnabled === false) return null
  return buildLlmsTxt(await llmsInput(ctx, false))
}

/** llms-full.txt, the same index with each page's text included. */
export const renderLlmsFullTxt = async (): Promise<string | null> => {
  const ctx = await readContext()
  if (!ctx.enabled || ctx.settings.llmsEnabled === false) return null
  return buildLlmsFullTxt(await llmsInput(ctx, true))
}

export const renderSecurityTxt = async (now: Date = new Date()): Promise<string | null> => {
  const ctx = await readContext()
  if (!ctx.enabled) return null
  return buildSecurityTxt(ctx.settings, ctx.baseUrl, now)
}

export const renderAdsTxt = async (): Promise<string | null> => {
  const ctx = await readContext()
  if (!ctx.enabled) return null
  return buildPlainTextFile(ctx.settings.adsTxt)
}

export const renderAppAdsTxt = async (): Promise<string | null> => {
  const ctx = await readContext()
  if (!ctx.enabled) return null
  return buildPlainTextFile(ctx.settings.appAdsTxt)
}

export const renderHumansTxt = async (): Promise<string | null> => {
  const ctx = await readContext()
  if (!ctx.enabled) return null
  return buildPlainTextFile(ctx.settings.humansTxt)
}

/** The web app manifest object, or null when the SEO feature is off. */
export const renderManifest = async (): Promise<WebManifest | null> => {
  const ctx = await readContext()
  if (!ctx.enabled) return null
  const icons = await getSiteIcons()
  const manifest = buildManifest({
    siteName: ctx.siteName,
    settings: ctx.settings,
    iconUrls: {
      favicon: icons.favicon ? absoluteUrl(icons.favicon, ctx.baseUrl) : undefined,
      logo: icons.logo ? absoluteUrl(icons.logo, ctx.baseUrl) : undefined,
    },
  })
  return manifest
}

/** Turns a built file into a response with the right type and caching. */
export const siteFileResponse = (body: string, contentType = 'text/plain; charset=utf-8'): Response =>
  new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  })

export const notFound = (): Response => new Response('Not found', { status: 404 })
