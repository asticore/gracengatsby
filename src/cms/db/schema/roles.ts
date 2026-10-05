import { Roles } from '@/collections/Roles'

import { generateTable } from './generate'

/**
 * Table for the `roles` collection, kept in its own file so adding a collection does not mean
 * editing the very large schema index. The collection module imports it from here.
 */
const rolesGenerated = generateTable(Roles)
export const roles = rolesGenerated.table
