import { ShippingZones } from '@/features/ecommerce/collections/ShippingZones'

import { generateTable } from './generate'

/** Table for the `shipping-zones` collection (own file so the schema index stays small). */
export const shippingZonesGenerated = generateTable(ShippingZones)
export const shippingZones = shippingZonesGenerated.table

import { generateArrayTable } from './generate'

const [regionsField, methodsField] = shippingZonesGenerated.arrayFields
export const shippingZonesRegions = generateArrayTable(ShippingZones.slug, shippingZonesGenerated.tableName, regionsField).table
export const shippingZonesMethodsGenerated = generateArrayTable(ShippingZones.slug, shippingZonesGenerated.tableName, methodsField)
export const shippingZonesMethods = shippingZonesMethodsGenerated.table
export const shippingZonesMethodsTableRates = shippingZonesMethodsGenerated.nestedArrayFields.find((f) => f.name === 'tableRates')!.table
export const shippingZonesMethodsClassSurcharges = shippingZonesMethodsGenerated.nestedArrayFields.find((f) => f.name === 'classSurcharges')!.table
