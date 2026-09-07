import type { Where } from '@/engine'

import { Users } from '@/collections/Users'

import { createCollectionOps } from '../generic'
import { users, usersRoles } from '../schema'

/**
 * Payload's document shape for the `users` collection - see
 * src/collections/Users.ts. Deliberately narrower than Payload's own: this
 * data layer never models `salt`/`hash` (password hashing stays entirely
 * Payload's job, same as real file upload/resize does for Media - see
 * ../schema/generate.ts's authColumns doc comment) or `sessions` (populated
 * only by Payload's own login flow, which this data layer does not
 * implement - confirmed empirically to always come back `[]` through
 * Payload's own Local API when nothing has ever logged in).
 */
export type UserDoc = {
  id: number
  email: string
  roles?: string[] | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(users, Users, {}, { selectTables: { roles: usersRoles } })

export const findUsers = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<UserDoc[]>
export const findUserByID = ops.findByID as unknown as (id: number) => Promise<UserDoc | null>
export const countUsers = ops.count
export const createUser = ops.create as unknown as (
  data: Partial<Omit<UserDoc, 'id' | 'updatedAt' | 'createdAt'>> & { email: string },
) => Promise<UserDoc>
export const updateUser = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<UserDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<UserDoc | null>
export const deleteUser = ops.deleteByID
