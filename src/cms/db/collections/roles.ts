import { Roles } from '@/collections/Roles'

import { createCollectionOps } from '../generic'
import { roles } from '../schema/roles'

/** The original engine's document shape for the `roles` collection - see src/collections/Roles.ts. */
export type RoleDoc = {
  id: number
  name: string
  slug: string
  description?: string | null
  builtIn?: boolean | null
  permissions?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(roles, Roles)

export const findRoles = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<RoleDoc[]>
/**
 * The adapter-shaped counterpart to findRoles (see ../generic.ts's
 * findPaginated doc comment) - what src/localapi/registry.ts's per-collection
 * adapter intercept calls for Roles' `find`, since the original engine's own list views
 * and API queries always pass sort/pagination, however simple the
 * collection's fields are.
 */
export const findRolesPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findRoleByID = ops.findByID as unknown as (id: number) => Promise<RoleDoc | null>
export const countRoles = ops.count
export const createRole = ops.create as unknown as (
  data: Partial<Omit<RoleDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string; slug: string },
) => Promise<RoleDoc>
export const updateRole = ops.updateByID as unknown as (id: number, data: Partial<Omit<RoleDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<RoleDoc | null>
export const deleteRole = ops.deleteByID
