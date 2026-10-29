import { can } from '@/features/roles/permissions'

import { parseHostList } from './scope'

/**
 * Domain lockdown, enforced in the collection access layer (not only hidden in the admin).
 *
 * A signed-in non-admin can carry an "Allowed domains" list, from their own account or, when their own is
 * empty, from their custom role. Empty = every domain (unrestricted). For such a user:
 * - reads, updates and deletes of pages, posts and products are limited to content that is either unscoped
 *   (no "Available on domains" list) or available on one of their domains (the access functions return a where filter);
 * - content they save must be available on their domains only, and cannot be left unscoped;
 * - changing their own Allowed domains needs the `domains` permission (or admin).
 *
 * Stored lists are delimited (",example.com,example.com.au,") so `contains` matches whole hosts only.
 */

type Actor = { roles?: string[]; allowedDomains?: unknown; customRoleAllowedDomains?: unknown } | null | undefined

/** The hosts this user may work on, or null when unrestricted (anonymous readers, admins, users with no list). */
export function allowedHostsFor(user: Actor): string[] | null {
  if (!user) return null
  if (user.roles?.includes('admin')) return null
  const own = parseHostList(user.allowedDomains)
  if (own.length > 0) return own
  const role = parseHostList(user.customRoleAllowedDomains)
  return role.length > 0 ? role : null
}

/** Where filter for content visible to someone limited to `hosts`: unscoped content, or content on one of those hosts. */
export function domainScopeWhere(hosts: readonly string[]): Record<string, unknown> {
  return {
    or: [{ availableDomains: { exists: false } }, ...hosts.map((host) => ({ availableDomains: { contains: `,${host},` } }))],
  }
}

/**
 * Wraps a collection access function so a domain-limited user only gets the documents in scope. Works for
 * read, update and delete: a `where` returned from an access function limits which documents the action reaches.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function domainScopedAccess(base: (args: any) => any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (args: any) => {
    const result = await base(args)
    const hosts = allowedHostsFor((args as { req?: { user?: Actor } })?.req?.user)
    if (hosts === null || result === false) return result
    const scope = domainScopeWhere(hosts)
    if (result === true) return scope
    return { and: [result, scope] }
  }
}

/** The value a write leaves in the list: the incoming one when present, otherwise the stored one (updates may omit it). */
export function domainWriteError(
  actor: Actor,
  incoming: unknown,
  stored: unknown,
): string | null {
  const hosts = allowedHostsFor(actor)
  if (hosts === null) return null
  const value = incoming !== undefined ? incoming : stored
  const saved = parseHostList(value)
  if (saved.length === 0) return 'Available on domains: choose the domains this content is for. This account can only publish on its allowed domains.'
  const outside = saved.filter((host) => !hosts.includes(host))
  return outside.length > 0 ? `Available on domains: ${outside.join(', ')} is not one of this account's allowed domains.` : null
}

/** Collection beforeChange: the content write guard. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function domainWriteGuard({ data, req, originalDoc }: { data?: any; req?: { user?: Actor }; originalDoc?: any }) {
  const error = domainWriteError(req?.user, data?.availableDomains, originalDoc?.availableDomains)
  if (error) throw new Error(error)
  return data
}

/** Users beforeChange: changing someone's Allowed domains needs the `domains` permission. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function allowedDomainsGuard({ data, req, originalDoc }: { data?: any; req?: { user?: Actor & { roles?: string[] } }; originalDoc?: any }) {
  if (!data || data.allowedDomains === undefined) return data
  const before = parseHostList(originalDoc?.allowedDomains).join(',')
  const after = parseHostList(data.allowedDomains).join(',')
  if (before === after) return data
  const actor = req?.user
  if (actor?.roles?.includes('admin')) return data
  if (!actor || !can(actor as never, 'domains', 'update')) throw new Error('Allowed domains: changing them needs the Domain access permission.')
  return data
}
