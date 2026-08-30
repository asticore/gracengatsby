import type { Access } from 'payload'

const isAdminUser = (user: { roles?: string[] | null } | null | undefined): boolean =>
  Boolean(user?.roles?.includes('admin'))

/**
 * A member may read their own membership row and nothing else.
 *
 * Writing is deliberately not covered here: every mutating access rule on
 * Memberships is admin-only. A member who could update their own row could set
 * `status` to active or point `tier` at the top tier and unlock the whole site
 * without paying - the gate trusts this table completely. All legitimate member
 * -initiated changes (signing up, cancelling) go through the feature's own
 * server functions, which write with `overrideAccess` after checking settings.
 */
export const isAdminOrMembershipOwner: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true
  if (!req.user) return false
  return { user: { equals: req.user.id } }
}

/** Admins only, matching the shop's own rule without importing its shape. */
export const isMembersAdmin: Access = ({ req }) => isAdminUser(req.user)
