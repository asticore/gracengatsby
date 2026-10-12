import { DataViews } from '@/features/dataViews/collections/DataViews'

import { generateTable } from './generate'

/** Table for the `data-views` (Tables and charts) collection, in its own file so the schema index is not edited. */
const dataViewsGenerated = generateTable(DataViews)
export const dataViews = dataViewsGenerated.table
