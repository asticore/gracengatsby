import { StockSubscriptions } from '@/features/ecommerce/collections/StockSubscriptions'

import { createCollectionOps } from '../generic'
import { stockSubscriptions } from '../schema/stockSubscriptions'

/** The document shape of the `stock-subscriptions` collection - see src/features/ecommerce/collections/StockSubscriptions.ts. */
export type StockSubscriptionDoc = {
  id: number
  product: number
  variation?: string | null
  email: string
  status: 'pending' | 'sent'
  notifiedAt?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(stockSubscriptions, StockSubscriptions)
export const findStockSubscriptionsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findStockSubscriptionByID = ops.findByID as unknown as (id: number) => Promise<StockSubscriptionDoc | null>
export const countStockSubscriptions = ops.count
export const createStockSubscription = ops.create as unknown as (data: Record<string, unknown>) => Promise<StockSubscriptionDoc>
export const updateStockSubscription = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<StockSubscriptionDoc | null>
export const deleteStockSubscription = ops.deleteByID