import type { Where } from '@/engine'

import { ABTests } from '@/features/abTesting/collections/ABTests'

import { createCollectionOps } from '../generic'
import { abTests, abTestsGoals, abTestsVariants } from '../schema'

/** One row of the `variants` array - see src/features/abTesting/collections/ABTests.ts. `page`/`template` are single-target relationships living directly on this array's own child table (eg_ab_tests_variants), the same mechanism Lessons' `resources.file` proved. */
export type VariantRow = {
  id?: string
  key?: string | null
  label?: string | null
  weight?: number | null
  isControl?: boolean | null
  page?: number | null
  template?: number | null
}

/** One row of the `goals` array - see src/features/abTesting/collections/ABTests.ts. `form` is a single-target relationship living directly on this array's own child table (eg_ab_tests_goals), same as `variants` above. */
export type GoalRow = {
  id?: string
  key?: string | null
  label?: string | null
  type?: string | null
  path?: string | null
  selector?: string | null
  form?: number | null
}

/**
 * Payload's document shape for the `ab-tests` collection - see
 * src/features/abTesting/collections/ABTests.ts. Payload's own `beforeChange`
 * hook assigns `variants[].key`/`goals[].key` and recomputes `targetPath` -
 * that happens inside Payload's engine, not this data layer, so a caller
 * writing through `createABTest` below must set those fields itself.
 */
export type ABTestDoc = {
  id: number
  name: string
  status: string
  page: number
  scope: string
  blockId?: string | null
  targetPath?: string | null
  startsAt?: string | null
  endsAt?: string | null
  variants?: VariantRow[] | null
  goals?: GoalRow[] | null
  notes?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(abTests, ABTests, { variants: abTestsVariants, goals: abTestsGoals })

export const findABTests = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<ABTestDoc[]>
export const findABTestByID = ops.findByID as unknown as (id: number) => Promise<ABTestDoc | null>
export const countABTests = ops.count
export const createABTest = ops.create as unknown as (
  data: Partial<Omit<ABTestDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string; status: string; page: number; scope: string },
) => Promise<ABTestDoc>
export const updateABTest = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<ABTestDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ABTestDoc | null>
export const deleteABTest = ops.deleteByID
