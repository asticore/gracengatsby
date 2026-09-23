import type { Sort, Where } from '@/engine'

import { Orders } from '@/features/ecommerce/collections/Orders'

import { createCollectionOps } from '../generic'
import { orders, ordersGenerated, ordersItems, ordersRels, ordersRelsTargetColumns } from '../schema'

export type OrderItem = { id: string; product?: number | null; quantity: number }
export type OrderAddress = {
  title?: string | null
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
}

/** Payload's document shape for the `orders` collection - see src/features/ecommerce/collections/Orders.ts. */
export type OrderDoc = {
  id: number
  items?: OrderItem[] | null
  shippingAddress?: OrderAddress | null
  customer?: number | null
  customerEmail?: string | null
  transactions?: number[] | null
  status?: string | null
  amount?: number | null
  currency?: string | null
  updatedAt: string
  createdAt: string
}

// `transactions` is a top-level (not inside a block) hasMany relationship -
// this app's first real exercise of createCollectionOps'
// `topLevelRelsFieldTargets` (see generic.ts's own doc comment: "Nothing in
// this app has one of these yet ... exercised by nothing but is wired up for
// whenever one shows up" - this is that one).
const ops = createCollectionOps(
  orders,
  Orders,
  { items: ordersItems },
  {
    relsTable: { table: ordersRels, targetColumns: ordersRelsTargetColumns },
    topLevelRelsFieldTargets: { transactions: 'transactions' },
    groupFields: ordersGenerated.groupFields,
  },
)

export const findOrders = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<OrderDoc[]>
export const findOrdersPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findOrderByID = ops.findByID as unknown as (id: number) => Promise<OrderDoc | null>
export const countOrders = ops.count
export const createOrder = ops.create as unknown as (data: Partial<Omit<OrderDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<OrderDoc>
export const updateOrder = ops.updateByID as unknown as (id: number, data: Partial<Omit<OrderDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<OrderDoc | null>
export const deleteOrder = ops.deleteByID
