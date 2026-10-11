import type { Access, FieldAccess } from '@/engine'
import { resolveAccess, OWNABLE_RESOURCES, type Action, type Resource } from '@/features/roles/permissions'

const checkRole = (roles: string[], user: { roles?: string[] } | null | undefined) =>
  Boolean(user?.roles?.some((role) => roles.includes(role)))

export const isAdmin: Access = ({ req }) => checkRole(['admin'], req.user)

export const adminOnlyFieldAccess: FieldAccess = ({ req }) => checkRole(['admin'], req.user)

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const isCustomer: FieldAccess = ({ req }) => Boolean(req.user) && !checkRole(['admin'], req.user)

export const adminOrPublishedStatus: Access = ({ req }) => {
  if (checkRole(['admin'], req.user)) return true
  return { _status: { equals: 'published' } }
}

/**
 * An admin, or the signed-in user asking about their own record.
 *
 * Needed because the Users collection is shared: the shop plugin maps
 * customers onto it, so "any signed-in user" includes every customer who has
 * ever checked out. Without this, the engine's default (anyone signed in) let
 * a customer change an admin's email and password and then log in as them.
 */
export const isAdminOrSelf: Access = ({ req }) => {
  if (checkRole(['admin'], req.user)) return true
  if (!req.user) return false
  return { id: { equals: req.user.id } }
}

export const isDocumentOwner: Access = ({ req }) => {
  if (checkRole(['admin'], req.user)) return true
  if (!req.user) return false
  return { customer: { equals: req.user.id } }
}

/**
 * Guest cart access, mirroring the real ecommerce plugin's
 * `hasCartSecretAccess(allowGuestCarts)` (Stage 10 Ecommerce, Layer 2). This
 * app always runs with `allowGuestCarts: true` (`engage.config.ts`'s
 * `carts:` key), so unlike the plugin's version this doesn't take that flag
 * as a parameter - flip this back to a parameterized factory if that ever
 * changes.
 *
 * A signed-out visitor's cart is matched by the `secret` value they were
 * handed back when they created it (see `beforeChangeCart` in
 * `../features/ecommerce/hooks/cartHooks.ts`), sent back as `?secret=`.
 * `req` here is `LocalReq` (see `src/localapi/access.ts`'s own doc comment
 * for why it's additive/untyped) - `handleFindByID`/`handleUpdateByID`/
 * `handleDeleteByID` in `src/localapi/rest.ts` thread the query string's
 * `secret` param onto it as `req.query.secret`.
 */
export const hasCartSecretAccess: Access = ({ req }) => {
  const cartSecret = (req as { query?: { secret?: string } }).query?.secret
  if (!cartSecret || typeof cartSecret !== 'string') return false
  return { secret: { equals: cartSecret } }
}

/** True for a signed-out request - used to allow guest cart creation. */
export const isGuest: Access = ({ req }) => !req.user

/**
 * Role-based access factories. They call resolveAccess(), the union of the user's built-in roles,
 * their custom role matrix (carried on the session user as `customRolePermissions`, see
 * src/features/roles/customRoleCache.ts) and per-user overrides. Nothing here is async.
 *
 * A custom role can limit read/update/delete to "only items they created" (matrix scope 'own'). That
 * becomes a Where on `createdBy`, so lists are filtered and single-document updates/deletes are
 * refused for other people's documents. Collections without a `createdBy` field cannot be scoped:
 * an 'own' scope there fails closed.
 *
 * Example:
 *   - Editor can read, create, update, delete content collections (pages, posts, etc.)
 *   - Viewer can only read
 *   - Admin has full access
 *   - Secret resources (users, settings, payments) remain admin-only
 */
const ownWhere = (slug: Resource, user: { id?: unknown } | null | undefined) => {
  if (!OWNABLE_RESOURCES.includes(slug)) return false
  if (user?.id === undefined || user?.id === null) return false
  return { createdBy: { equals: user.id } }
}

/**
 * Role-based access combined with published status fallback for reads.
 * Admin -> true; user with read permission -> true (or their own documents plus published ones when
 * the grant is limited to own items); otherwise -> published-only where clause.
 * Used for collections that should be published-only for unauthorized users.
 */
export function roleOrPublished(slug: Resource): Access {
  return ({ req }) => {
    // Admin always has access
    if (checkRole(['admin'], req.user)) return true
    const level = resolveAccess(req.user as any, slug, 'read')
    if (level === 'all') return true
    if (level === 'own') {
      const own = ownWhere(slug, req.user as any)
      return own ? { or: [own, { _status: { equals: 'published' } }] } : { _status: { equals: 'published' } }
    }
    // Otherwise restrict to published documents
    return { _status: { equals: 'published' } }
  }
}

export function roleAccess(slug: Resource, action: Action): Access {
  return ({ req }) => {
    // Admin always has access
    if (checkRole(['admin'], req.user)) return true
    const level = resolveAccess(req.user as any, slug, action)
    if (level === 'all') return true
    if (level === 'own') return ownWhere(slug, req.user as any)
    return false
  }
}
