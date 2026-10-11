import { Coupons } from '@/features/ecommerce/collections/Coupons'

import { createCollectionOps } from '../generic'
import { coupons } from '../schema/coupons'

/** Loosely typed document for the `coupons` collection - see src/features/ecommerce/collections/Coupons.ts. */
export type CouponDoc = { id: number; updatedAt: string; createdAt: string } & Record<string, unknown>

const ops = createCollectionOps(coupons, Coupons)

export const findCoupons = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<CouponDoc[]>
export const findCouponsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findCouponByID = ops.findByID as unknown as (id: number) => Promise<CouponDoc | null>
export const countCoupons = ops.count
export const createCoupon = ops.create as unknown as (data: Record<string, unknown>) => Promise<CouponDoc>
export const updateCoupon = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<CouponDoc | null>
export const deleteCoupon = ops.deleteByID
