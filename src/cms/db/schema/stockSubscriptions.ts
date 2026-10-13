import { StockSubscriptions } from '@/features/ecommerce/collections/StockSubscriptions'

import { generateTable } from './generate'

/** Table for the `stock-subscriptions` collection, in its own file like ./reviewEvents.ts. */
export const stockSubscriptionsGenerated = generateTable(StockSubscriptions)
export const stockSubscriptions = stockSubscriptionsGenerated.table
