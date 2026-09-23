import type { Sort, Where } from '@/engine'

import { Carts } from '@/features/ecommerce/collections/Carts'

import { createCollectionOps } from '../generic'
import { carts, cartsItems } from '../schema'

export type CartItem = { id: string; product?: number | null; quantity: number }

/**
 * Payload's document shape for the `carts` collection - see
 * src/features/ecommerce/collections/Carts.ts. `status` is NOT modeled here -
 * it's a virtual, hook-computed field with no real column (see that file's
 * header comment) - Layer 2 territory, not this DB-layer stage.
 */
export type CartDoc = {
  id: number
  items?: CartItem[] | null
  secret?: string | null
  customer?: number | null
  purchasedAt?: string | null
  subtotal?: number | null
  currency?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(carts, Carts, { items: cartsItems })

export const findCarts = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<CartDoc[]>
export const findCartsPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findCartByID = ops.findByID as unknown as (id: number) => Promise<CartDoc | null>
export const countCarts = ops.count
export const createCart = ops.create as unknown as (data: Partial<Omit<CartDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<CartDoc>
export const updateCart = ops.updateByID as unknown as (id: number, data: Partial<Omit<CartDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<CartDoc | null>
export const deleteCart = ops.deleteByID
