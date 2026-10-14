import { ProductSubscriptions } from '@/features/ecommerce/collections/ProductSubscriptions'

import { createCollectionOps } from '../generic'
import { productSubscriptions } from '../schema/productSubscriptions'

/** The document shape of the `product-subscriptions` collection - see src/features/ecommerce/collections/ProductSubscriptions.ts. */
export type ProductSubscriptionDoc = {
  id: number
  customer?: number | null
  customerEmail?: string | null
  product: number
  productName?: string | null
  status: string
  amountCents?: number | null
  currency?: string | null
  billingInterval?: string | null
  billingIntervalCount?: number | null
  paymentsLimit?: number | null
  paymentsMade?: number | null
  startedAt?: string | null
  trialEndsAt?: string | null
  nextPaymentAt?: string | null
  cancelledAt?: string | null
  endedAt?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePriceId?: string | null
  history?: unknown[] | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(productSubscriptions, ProductSubscriptions)
export const findProductSubscriptionsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findProductSubscriptionByID = ops.findByID as unknown as (id: number) => Promise<ProductSubscriptionDoc | null>
export const countProductSubscriptions = ops.count
export const createProductSubscription = ops.create as unknown as (data: Record<string, unknown>) => Promise<ProductSubscriptionDoc>
export const updateProductSubscription = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<ProductSubscriptionDoc | null>
export const deleteProductSubscription = ops.deleteByID
