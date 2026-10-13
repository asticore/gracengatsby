import { FormDrafts } from '@/features/forms/collections/FormDrafts'

import { generateTable } from './generate'

/** Table for the `form-drafts` collection, in its own file like ./stockSubscriptions.ts. */
export const formDraftsGenerated = generateTable(FormDrafts)
export const formDrafts = formDraftsGenerated.table
