import { ShippingZones } from '@/features/ecommerce/collections/ShippingZones'

import { createCollectionOps } from '../generic'
import { shippingZones, shippingZonesMethods, shippingZonesMethodsClassSurcharges, shippingZonesMethodsTableRates, shippingZonesRegions } from '../schema/shippingZones'

/** Loosely typed document for the `shipping-zones` collection - see src/features/ecommerce/collections/ShippingZones.ts. */
export type ShippingZoneDoc = { id: number; updatedAt: string; createdAt: string } & Record<string, unknown>

const ops = createCollectionOps(shippingZones, ShippingZones, {
  regions: shippingZonesRegions,
  methods: {
    table: shippingZonesMethods,
    nestedArrayTables: { tableRates: { table: shippingZonesMethodsTableRates }, classSurcharges: { table: shippingZonesMethodsClassSurcharges } },
  },
})

export const findShippingZones = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<ShippingZoneDoc[]>
export const findShippingZonesPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findShippingZoneByID = ops.findByID as unknown as (id: number) => Promise<ShippingZoneDoc | null>
export const countShippingZones = ops.count
export const createShippingZone = ops.create as unknown as (data: Record<string, unknown>) => Promise<ShippingZoneDoc>
export const updateShippingZone = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<ShippingZoneDoc | null>
export const deleteShippingZone = ops.deleteByID
