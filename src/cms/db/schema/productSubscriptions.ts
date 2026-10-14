import { ProductSubscriptions } from '@/features/ecommerce/collections/ProductSubscriptions'
import type { Field } from '@/engine'

import { generateTable } from './generate'

/**
 * Table for the `product-subscriptions` collection, in its own file like ./stockSubscriptions.ts.
 * The admin panel is a `ui` field, which is not a column, so it is stripped before the table is generated.
 */
const schemaConfig = { ...ProductSubscriptions, fields: ProductSubscriptions.fields.filter((field: Field) => field.type !== 'ui') }
export const productSubscriptionsGenerated = generateTable(schemaConfig)
export const productSubscriptions = productSubscriptionsGenerated.table
