import type { Sort, Where } from '@/engine'

import { Preferences } from '@/collections/Preferences'

import { createCollectionOps } from '../generic'
import { preferences, preferencesRels, preferencesRelsTargetColumns } from '../schema'

/** The original engine's document shape for the `engine-preferences` collection - see src/collections/Preferences.ts. */
export type PreferenceDoc = {
  id: number
  user?: number[] | null
  key?: string | null
  value?: unknown
  updatedAt: string
  createdAt: string
}

// `user` is a top-level, single-target (`relationTo: ['users']`) rels field -
// same `topLevelRelsFieldTargets` pattern as orders.ts's `transactions`
// (see that file's header). It comes back as `number[]` (the mechanism
// always produces arrays - see generic.ts's attachTopLevelRels), not the
// bare-id scalar every OTHER relationship field in this app uses - a
// confirmed, documented divergence with no consequence today since no
// caller reads/writes this field's value (see Preferences.ts header).
const ops = createCollectionOps(
  preferences,
  Preferences,
  {},
  {
    relsTable: { table: preferencesRels, targetColumns: preferencesRelsTargetColumns },
    topLevelRelsFieldTargets: { user: 'users' },
  },
)

export const findPreferences = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<PreferenceDoc[]>
export const findPreferencesPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findPreferenceByID = ops.findByID as unknown as (id: number) => Promise<PreferenceDoc | null>
export const countPreferences = ops.count
export const createPreference = ops.create as unknown as (data: Partial<Omit<PreferenceDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<PreferenceDoc>
export const updatePreference = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<PreferenceDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<PreferenceDoc | null>
export const deletePreference = ops.deleteByID
