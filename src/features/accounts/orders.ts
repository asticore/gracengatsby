import type { Engine } from '@/engine'
import type { Order } from '@/engage-types'

import type { AccountUser } from './session'
import { ORDERS_SLUG } from './types'

/**
 * Order history.
 *
 * Both queries run with `overrideAccess: false` and the signed-in user, so the
 * shop's own rule on the collection - admin, or the customer named on the
 * order - is what decides. No `where` clause of ours filters by customer, and
 * no component checks an id before drawing.
 *
 * That is the difference that matters on the detail screen. Fetching an order
 * with access overridden and then comparing `order.customer` in the page would
 * work right up until somebody forgot the comparison; here, an id belonging to
 * another customer produces no document at all, and the page 404s on nothing.
 */

export const ordersForCustomer = async (
  engine: Engine,
  user: AccountUser,
  limit = 50,
): Promise<Order[]> => {
  const { docs } = await engine
    .find({
      collection: ORDERS_SLUG,
      sort: '-createdAt',
      limit,
      depth: 1,
      overrideAccess: false,
      user,
    })
    .catch(() => ({ docs: [] as Order[] }))

  return docs as Order[]
}

export const orderForCustomer = async (
  engine: Engine,
  user: AccountUser,
  id: string,
): Promise<Order | null> => {
  // Route parameters are strings and the ids are integers; a non-numeric one
  // never reaches the database.
  const numeric = Number(id)
  if (!Number.isInteger(numeric) || numeric <= 0) return null

  return (await engine
    .findByID({
      collection: ORDERS_SLUG,
      id: numeric,
      depth: 2,
      overrideAccess: false,
      user,
    })
    .catch((): null => null)) as Order | null
}

/** Money is stored in the smallest unit of the currency. */
export const formatAmount = (amount?: number | null, currency?: string | null): string => {
  if (typeof amount !== 'number') return '-'
  const code = currency || 'AUD'
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: code }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`
  }
}

export const formatDate = (value?: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}
