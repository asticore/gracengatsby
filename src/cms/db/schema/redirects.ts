import { Redirects } from '@/features/redirects/collection'

import { generateTable } from './generate'

/**
 * Table for the `redirects` collection, kept in its own file so adding a collection does not mean
 * editing the very large schema index. The collection module imports it from here.
 */
const redirectsGenerated = generateTable(Redirects)
export const redirects = redirectsGenerated.table
