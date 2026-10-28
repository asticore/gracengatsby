import { FALLBACK_GROUP_LABEL, NAV_STRUCTURE } from '@/components/admin/nav/navStructure'

/**
 * Admin URLs for collections. A collection lives under the admin menu group it
 * sits in (NAV_STRUCTURE), named in lower case: /admin/content/pages,
 * /admin/shop/orders, /admin/other/users. Collections in no group use `other`.
 * The old /admin/collections/<slug> prefix is gone; those URLs answer with a
 * permanent (308) redirect, see legacyCollectionRedirect.
 *
 * Pure module: safe to import from server, client and middleware code.
 */

const GROUP_BY_SLUG: ReadonlyMap<string, string> = new Map(
  NAV_STRUCTURE.flatMap((group) =>
    group.entities.filter((entity) => entity.type === 'collections').map((entity) => [entity.slug, group.label.toLowerCase()] as const),
  ),
)

/** Lower-case menu group name for a collection; `other` when it sits in no group. */
export function collectionGroup(slug: string): string {
  return GROUP_BY_SLUG.get(slug) ?? FALLBACK_GROUP_LABEL.toLowerCase()
}

/** A collection's route below the admin root: `/content/pages`, `/other/users`. For callers that pass it to formatAdminURL. */
export function collectionRoute(slug: string): string {
  return `/${collectionGroup(slug)}/${slug}`
}

/** The admin URL of a collection's list screen: `/admin/content/pages`. Append `/create`, `/<id>` etc. at the call site. */
export function adminCollectionPath(slug: string, base = '/admin'): string {
  return `${base}${collectionRoute(slug)}`
}

/**
 * True when the admin path segments name a collection: the first segment is the
 * menu group the collection sits in. Views and globals never use a group name
 * for their own path, so they are not matched here.
 */
export function isCollectionSegments(segments: readonly string[]): boolean {
  return segments.length >= 2 && segments[0] === collectionGroup(segments[1])
}

/**
 * For a request path under the old `/admin/collections/<slug>` form, the new
 * path with the rest of the path and the query string kept. Null for anything
 * else, including `/admin/collections` with no slug and every new-style path.
 */
export function legacyCollectionRedirect(pathname: string, search = ''): string | null {
  const match = /^\/admin\/collections\/([^/]+)(\/.*)?$/.exec(pathname)
  if (!match) return null
  return `${adminCollectionPath(match[1])}${match[2] ?? ''}${search}`
}
