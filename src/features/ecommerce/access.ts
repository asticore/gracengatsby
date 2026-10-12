import type { Access, FieldAccess } from '@/engine'

import { can, resolveAccess, type Action } from '@/features/roles/permissions'

type U = { id?: number | string; roles?: string[] } | null | undefined

const isAdminUser = (user: U) => Boolean(user?.roles?.includes('admin'))

/** Staff = an admin, or a user whose role grants `orders.read`. Customers are never staff. */
export const isOrderStaff = (user: U): boolean => isAdminUser(user) || (Boolean(user) && resolveAccess(user as never, 'orders', 'read') === 'all')

/**
 * Orders access: admins and roles with the matching `orders` permission get
 * the permission; a signed-in customer may only READ orders that name them
 * (`customer` equals their id) and may never create, change or delete one.
 */
export const ordersAccess =
  (action: Action): Access =>
  ({ req }) => {
    const user = req.user as U
    if (isAdminUser(user)) return true
    // resolveAccess like roleAccess: a custom role limited to "own" items sees only orders that name them.
    const level = user ? resolveAccess(user as never, 'orders', action) : false
    if (level === 'all') return true
    if (action === 'read' && user?.id != null) return { customer: { equals: user.id } }
    return false
  }

/** Field-level: staff only (internal notes, payment ids, usage flags). */
export const staffFieldAccess: FieldAccess = ({ req }) => isOrderStaff(req.user as U)

/** Plain permission check for the shop's own collections (refunds, coupons, ...). */
export const shopAccess =
  (resource: 'order-refunds' | 'coupons' | 'shipping-zones' | 'tax-rates' | 'gift-cards' | 'store-credits' | 'credit-ledger' | 'shipping-manifests', action: Action): Access =>
  ({ req }) => {
    const user = req.user as U
    if (isAdminUser(user)) return true
    return Boolean(user) && can(user as never, resource, action, {})
  }
