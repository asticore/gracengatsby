import type { Access, FieldAccess } from '@/engine'

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
