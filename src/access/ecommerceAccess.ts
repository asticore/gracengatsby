import type { Access, FieldAccess } from '@/engine'
import { can, type Action, type Resource } from '@/features/roles/permissions'

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
 * Factory for role-based access to collections.
 * Returns an access function that calls can() to check permissions based on the user's roles.
 *
 * Note: Custom role matrix is not available synchronously in the access layer,
 * so this uses only the built-in role definitions. For custom roles, the REST/GraphQL
 * layer must check permissions separately through the admin context.
 *
 * Example:
 *   - Editor can read, create, update, delete content collections (pages, posts, etc.)
 *   - Viewer can only read
 *   - Admin has full access
 *   - Secret resources (users, settings, payments) remain admin-only
 */
/**
 * Role-based access combined with published status fallback for reads.
 * Admin -> true; user with read permission -> true; otherwise -> published-only where clause.
 * Used for collections that should be published-only for unauthorized users.
 */
export function roleOrPublished(slug: Resource): Access {
  return ({ req }) => {
    // Admin always has access
    if (checkRole(['admin'], req.user)) return true
    // Check if user has read permission via can()
    if (can(req.user as any, slug, 'read', {})) return true
    // Otherwise restrict to published documents
    return { _status: { equals: 'published' } }
  }
}

export function roleAccess(slug: Resource, action: Action): Access {
  return ({ req }) => {
    // Admin always has access
    if (checkRole(['admin'], req.user)) return true
    // Use can() with built-in role matrix (no custom matrix available here)
    return can(req.user as any, slug, action, {})
  }
}
