import Link from 'next/link'
import React from 'react'
import type { Metadata } from 'next'

import { renderWithTemplate } from '@/features/siteTemplates/render'
import { getEngine } from '@/lib/engine'
import { excludeProtected } from '@/features/visibility/excludeProtected'
import { viewerFromRequestContext } from '@/features/visibility/gate'
import { getFeatureFlags } from '@/utilities/features'
import { getAllResolvedPages } from '@/utilities/pagePaths'
import type { Event as EventDoc, Post, Product } from '@/engage-types'

/**
 * Public site search results at /search?q=... (the search-box element submits here).
 *
 * Results are fetched per request because the query string is part of the page. The edge cache never stores a URL
 * with a query string (see src/features/speed/edgeCache.ts), so one visitor's search is never served to another.
 * Search pages are kept out of the index with noindex (follow stays on so the links are still crawled).
 */

const MAX_QUERY_LENGTH = 80
const MAX_SCAN = 200
const MAX_RESULTS = 20
const EXCERPT_LENGTH = 160

type HitType = 'Page' | 'Post' | 'Product' | 'Event'
type Hit = { key: string; type: HitType; title: string; href: string; excerpt: string }
type Found = { hits: Hit[]; total: number }

const NONE: Found = { hits: [], total: 0 }

export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

/** Collapses whitespace, trims and clips to MAX_QUERY_LENGTH characters. Empty string when there is nothing to search. */
function normalizeQuery(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH).trim()
}

/** Plain-text excerpt, whitespace collapsed and clipped. React escapes it when rendered. */
function snippet(text: string | null | undefined): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean.length > EXCERPT_LENGTH ? `${clean.slice(0, EXCERPT_LENGTH - 3).trimEnd()}...` : clean
}

/** Case-insensitive "contains" for the pages scan (the engine's own `contains` is used for the other collections). */
function contains(text: unknown, needle: string): boolean {
  return typeof text === 'string' && text.toLowerCase().includes(needle)
}

/** Pages are matched in memory: their paths come from the same resolver the nav and the page route use. */
async function searchPages(query: string): Promise<Found> {
  const needle = query.toLowerCase()
  const resolved = await getAllResolvedPages()
  const open = new Set((await excludeProtected('pages', resolved.map((r) => r.page), await viewerFromRequestContext())).map((pg) => pg.id))
  const entries = resolved.filter((r) => open.has(r.page.id)).slice(0, MAX_SCAN)
  const matches: Hit[] = []
  for (const { page, path } of entries) {
    if (!page.isHomepage && (path.length === 0 || path.some((segment) => !segment))) continue
    const description = page.seo?.metaDescription ?? null
    if (!(contains(page.title, needle) || contains(page.slug, needle) || contains(description, needle))) continue
    matches.push({
      key: `page-${page.id}`,
      type: 'Page',
      title: page.title,
      href: page.isHomepage ? '/' : `/${path.join('/')}`,
      excerpt: snippet(description),
    })
  }
  return { hits: matches.slice(0, MAX_RESULTS), total: matches.length }
}

async function searchPosts(query: string): Promise<Found> {
  const engine = await getEngine()
  const { docs, totalDocs } = (await engine.find({
    collection: 'posts',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { or: [{ title: { contains: query } }, { slug: { contains: query } }, { excerpt: { contains: query } }] },
      ],
    },
    sort: '-publishedDate',
    limit: MAX_RESULTS,
    depth: 0,
  })) as unknown as { docs: Post[]; totalDocs: number }
  const visible = await excludeProtected('posts', docs, await viewerFromRequestContext())
  const hits = visible
    .filter((post) => post.slug)
    .map((post): Hit => ({
      key: `post-${post.id}`,
      type: 'Post',
      title: post.title,
      href: `/blog/${post.slug}`,
      excerpt: snippet(post.excerpt),
    }))
  return { hits, total: Math.max(0, totalDocs - (docs.length - visible.length)) }
}

async function searchProducts(query: string): Promise<Found> {
  const engine = await getEngine()
  const { docs, totalDocs } = (await engine.find({
    collection: 'products',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { or: [{ title: { contains: query } }, { slug: { contains: query } }] },
      ],
    },
    sort: '-createdAt',
    limit: MAX_RESULTS,
    depth: 0,
  })) as unknown as { docs: Product[]; totalDocs: number }
  const visible = await excludeProtected('products', docs, await viewerFromRequestContext())
  const hits = visible
    .filter((product) => product.slug)
    .map((product): Hit => ({
      key: `product-${product.id}`,
      type: 'Product',
      title: product.title,
      href: `/shop/${product.slug}`,
      excerpt: '',
    }))
  return { hits, total: Math.max(0, totalDocs - (docs.length - visible.length)) }
}

async function searchEvents(query: string): Promise<Found> {
  const engine = await getEngine()
  const { docs, totalDocs } = (await engine.find({
    collection: 'events',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { or: [{ title: { contains: query } }, { slug: { contains: query } }] },
      ],
    },
    sort: '-startDate',
    limit: MAX_RESULTS,
    depth: 0,
  })) as unknown as { docs: EventDoc[]; totalDocs: number }
  const visible = await excludeProtected('events', docs, await viewerFromRequestContext())
  const hits = visible
    .filter((event) => event.slug)
    .map((event): Hit => ({
      key: `event-${event.id}`,
      type: 'Event',
      title: event.title,
      href: `/events/${event.slug}`,
      excerpt: '',
    }))
  return { hits, total: Math.max(0, totalDocs - (docs.length - visible.length)) }
}

/** Searches every source that is switched on. A source that fails contributes nothing; the page never throws. */
async function runSearch(query: string): Promise<Found> {
  try {
    const flags = await getFeatureFlags()
    const [pages, posts, products, events] = await Promise.all([
      searchPages(query).catch(() => NONE),
      flags.blog ? searchPosts(query).catch(() => NONE) : NONE,
      flags.ecommerce ? searchProducts(query).catch(() => NONE) : NONE,
      flags.events ? searchEvents(query).catch(() => NONE) : NONE,
    ])
    const sources = [pages, posts, products, events]
    return {
      hits: sources.flatMap((found) => found.hits).slice(0, MAX_RESULTS),
      total: sources.reduce((sum, found) => sum + found.total, 0),
    }
  } catch {
    return NONE
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const query = normalizeQuery(first(sp.q)) || normalizeQuery(first(sp.s))
  const found = query ? await runSearch(query) : NONE

  const body = (
    <div className="page-shell">
      <div className="section-heading">
        <h1>Search</h1>
      </div>

      <form role="search" action="/search" method="get" className="mb-8 flex max-w-[640px] flex-wrap gap-2">
        <label className="flex-1">
          <span className="sr-only">Search the site</span>
          <input
            className="w-full border border-[var(--color-line)] bg-white px-4 py-2"
            type="search"
            name="q"
            defaultValue={query}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Search"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <button className="px-5 py-2 uppercase tracking-[0.08em]" type="submit">
          Search
        </button>
      </form>

      {!query && <p className="opacity-80">Enter a word or phrase to search the site.</p>}

      {query && (
        <>
          <p className="mb-6 opacity-80" aria-live="polite">
            {found.total === 0
              ? `No results for "${query}".`
              : `${found.total} ${found.total === 1 ? 'result' : 'results'} for "${query}"${found.total > found.hits.length ? `, showing the first ${found.hits.length}` : ''}.`}
          </p>
          {found.hits.length > 0 && (
            <ol className="flex max-w-[640px] flex-col gap-6">
              {found.hits.map((hit) => (
                <li key={hit.key}>
                  <article>
                    <p className="uppercase text-[0.7rem] tracking-[0.08em] text-[var(--color-gold)]">{hit.type}</p>
                    <h2>
                      <Link href={hit.href}>{hit.title}</Link>
                    </h2>
                    {hit.excerpt && <p className="opacity-80">{hit.excerpt}</p>}
                  </article>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
  return renderWithTemplate({ kind: 'search-results', ctx: { path: '/search' }, content: body })
}
