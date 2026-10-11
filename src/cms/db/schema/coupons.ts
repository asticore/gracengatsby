import { Coupons } from '@/features/ecommerce/collections/Coupons'

import { generateTable } from './generate'

/** Table for the `coupons` collection (own file so the schema index stays small). */
export const couponsGenerated = generateTable(Coupons)
export const coupons = couponsGenerated.table
