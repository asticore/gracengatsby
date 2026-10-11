import { OrderRefunds } from '@/features/ecommerce/collections/OrderRefunds'

import { createCollectionOps } from '../generic'
import { orderRefunds } from '../schema/orderRefunds'

/** Loosely typed document for the `order-refunds` collection - see src/features/ecommerce/collections/OrderRefunds.ts. */
export type OrderRefundDoc = { id: number; updatedAt: string; createdAt: string } & Record<string, unknown>

const ops = createCollectionOps(orderRefunds, OrderRefunds)

export const findOrderRefunds = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<OrderRefundDoc[]>
export const findOrderRefundsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findOrderRefundByID = ops.findByID as unknown as (id: number) => Promise<OrderRefundDoc | null>
export const countOrderRefunds = ops.count
export const createOrderRefund = ops.create as unknown as (data: Record<string, unknown>) => Promise<OrderRefundDoc>
export const updateOrderRefund = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<OrderRefundDoc | null>
export const deleteOrderRefund = ops.deleteByID
