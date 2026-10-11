import { TaxRates } from '@/features/ecommerce/collections/TaxRates'

import { generateTable } from './generate'

/** Table for the `tax-rates` collection (own file so the schema index stays small). */
export const taxRatesGenerated = generateTable(TaxRates)
export const taxRates = taxRatesGenerated.table
