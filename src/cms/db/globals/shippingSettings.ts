import { ShippingSettings } from '@/globals/ShippingSettings'

import { createGlobalOps } from '../generic'
import { shippingSettings, shippingSettingsGenerated } from '../schema'

/**
 * Document shape of the `shipping-settings` global - see src/globals/ShippingSettings.ts. Groups only (origin,
 * rates and one per carrier) plus a json `packages` list, so `generateTable()` + `groupFields` covers it, the
 * same way PaymentSettings does. Carrier secret keys carry the encrypt/decrypt hooks from the config.
 */
export type ShippingSettingsDoc = {
  id: number
  packages?: unknown
  updatedAt: string
  createdAt: string
} & Record<string, unknown>

const ops = createGlobalOps(shippingSettings, ShippingSettings, {}, { groupFields: shippingSettingsGenerated.groupFields })

export const findShippingSettings = ops.find as unknown as () => Promise<ShippingSettingsDoc | null>
export const updateShippingSettings = ops.update as unknown as (data: Record<string, unknown>) => Promise<ShippingSettingsDoc>
