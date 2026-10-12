import { ShippingManifests } from '@/features/ecommerce/collections/ShippingManifests'

import { createCollectionOps } from '../generic'
import { shippingManifests } from '../schema/shopShipping'

type Doc = { id: number; updatedAt: string; createdAt: string } & Record<string, unknown>
type Page = ReturnType<ReturnType<typeof createCollectionOps>['findPaginated']>
type PageArgs = { where?: import('@/engine').Where; sort?: import('@/engine').Sort; limit?: number; page?: number; pagination?: boolean }

const ops = createCollectionOps(shippingManifests, ShippingManifests)
export const findShippingManifestsPaginated = ops.findPaginated as unknown as (args?: PageArgs) => Page
export const findShippingManifestByID = ops.findByID as unknown as (id: number) => Promise<Doc | null>
export const countShippingManifests = ops.count
export const createShippingManifest = ops.create as unknown as (data: Record<string, unknown>) => Promise<Doc>
export const updateShippingManifest = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<Doc | null>
export const deleteShippingManifest = ops.deleteByID
