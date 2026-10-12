import type { PageSpeedCollection } from './types'

/**
 * Where a document lives on the public site, and the one URL we are willing to send to Google.
 *
 * SSRF note: the address is ALWAYS built here from the configured site origin plus the document's
 * own slug(s), looked up on the server. Nothing from the browser (no URL, host or path) ever reaches
 * this code, and the origin must be a public https host.
 */

type Doc = Record<string, unknown>

const MAX_DEPTH = 9

const idOf = (value: unknown): number | string | undefined => {
  if (value && typeof value === 'object') return (value as { id?: number | string }).id
  if (typeof value === 'number' || typeof value === 'string') return value
  return undefined
}

const validSlug = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\s/\\?#%]/.test(value)

/** The configured public origin, without a trailing slash. */
export function siteOrigin(): string {
  return (process.env.SITE_URL || 'https://gracengatsby.com').trim().replace(/\/+$/, '')
}

/** True for a plain https origin on a public host name. Rejects localhost, IP literals and internal names. */
export function isPublicOrigin(origin: string): boolean {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password || url.port) return false
  if (url.pathname !== '/' && url.pathname !== '') return false
  const host = url.hostname.toLowerCase()
  if (!host.includes('.')) return false
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return false
  // IPv4 / IPv6 literals are never a real public site for this purpose.
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return false
  return true
}

/**
 * Public path for a document, or null when it has none (missing slug, broken parent chain).
 * `loadParent` fetches a parent page by id; it is only used for pages.
 */
export async function publicPath(
  collection: PageSpeedCollection,
  doc: Doc,
  loadParent: (id: number | string) => Promise<Doc | null>,
): Promise<string | null> {
  if (collection === 'pages') {
    if (doc.isHomepage) return '/'
    const segments: string[] = []
    let current: Doc | null = doc
    for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
      if (!validSlug(current.slug)) return null
      segments.unshift(encodeURIComponent(current.slug))
      const parentId = idOf(current.parent)
      if (parentId === undefined) return `/${segments.join('/')}`
      current = await loadParent(parentId)
    }
    return null
  }
  if (!validSlug(doc.slug)) return null
  const prefix = collection === 'posts' ? '/blog' : collection === 'products' ? '/shop' : '/events'
  return `${prefix}/${encodeURIComponent(doc.slug)}`
}

export type TargetResult = { ok: true; url: string } | { ok: false; reason: string }

/** Why a document cannot be tested, or the URL to test. Only published documents are testable. */
export function resolveTarget(opts: { status: unknown; draftsEnabled?: boolean; path: string | null; origin?: string }): TargetResult {
  if (opts.draftsEnabled !== false && opts.status !== 'published') {
    return { ok: false, reason: 'This is a draft. Google can only test pages visitors can see, so publish it first.' }
  }
  if (!opts.path) {
    return { ok: false, reason: 'This document has no public address yet. Give it a slug (and a published parent page, if it has one), then save.' }
  }
  const origin = (opts.origin ?? siteOrigin()).replace(/\/+$/, '')
  if (!isPublicOrigin(origin)) {
    return { ok: false, reason: 'The site address (SITE_URL) is not a public https address, so Google cannot reach it. Tests only work on the live site.' }
  }
  return { ok: true, url: `${origin}${opts.path}` }
}
