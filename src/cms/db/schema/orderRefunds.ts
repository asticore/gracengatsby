import { OrderRefunds } from '@/features/ecommerce/collections/OrderRefunds'

import { generateTable } from './generate'

/** Table for the `order-refunds` collection (own file so the schema index stays small). */
export const orderRefundsGenerated = generateTable(OrderRefunds)
export const orderRefunds = orderRefundsGenerated.table
