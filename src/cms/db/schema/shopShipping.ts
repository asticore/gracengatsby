import { ShippingManifests } from '@/features/ecommerce/collections/ShippingManifests'

import { generateTable } from './generate'

/** Table for shipping manifests (own file so the schema index stays small). */
export const shippingManifestsGenerated = generateTable(ShippingManifests)
export const shippingManifests = shippingManifestsGenerated.table
