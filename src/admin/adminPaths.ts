/**
 * Admin URLs for collections. Content collections live under
 * /admin/content/<slug>; every other collection stays under
 * /admin/collections/<slug>. The old /admin/collections/<content-slug> URLs
 * answer with a permanent (308) redirect, see legacyCollectionRedirect.
 *
 * Pure module: safe to import from server, client and middleware code.
 */

export const CONTENT_COLLECTION_SLUGS = [
  'pages',
  'posts',
  'products',
  'events',
  'media',
  'faqs',
  'page-templates',
  'site-templates',
  'reusable-sections',
  'courses',
  'lessons',
] as const

export type ContentCollectionSlug = (typeof CONTENT_COLLECTION_SLUGS)[number]

const CONTENT_SET: ReadonlySet<string> = new Set<string>(CONTENT_COLLECTION_SLUGS)

export function isContentCollection(slug: string): boolean {
  return CONTENT_SET.has(slug)
}

/** A collection's route below the admin root: `/content/posts` or `/collections/users`. For callers that pass it to formatAdminURL. */
export function collectionRoute(slug: string): string {
  return `/${isContentCollection(slug) ? 'content' : 'collections'}/${slug}`
}

/** The admin URL of a collection's list screen: `/admin/content/posts` or `/admin/collections/users`. Append `/create`, `/<id>` etc. at the call site. */
export function adminCollectionPath(slug: string, base = '/admin'): string {
  return `${base}${collectionRoute(slug)}`
}

/**
 * For a request path under the old `/admin/collections/<content-slug>` form,
 * the new path (query string kept). Null for anything else, including every
 * non-content collection and every path already under /admin/content.
 */
export function legacyCollectionRedirect(pathname: string, search = ''): string | null {
  const match = /^\/admin\/collections\/([^/]+)(\/.*)?$/.exec(pathname)
  if (!match || !isContentCollection(match[1])) return null
  return `/admin/content/${match[1]}${match[2] ?? ''}${search}`
}
