import type { Access, FieldAccess } from 'payload'

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
