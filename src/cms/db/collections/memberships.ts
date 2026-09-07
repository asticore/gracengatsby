import type { Where } from '@/engine'

import { Memberships } from '@/features/members/collections/Memberships'

import { createCollectionOps } from '../generic'
import { memberships } from '../schema'

/**
 * Payload's document shape for the `memberships` collection - see
 * src/features/members/collections/Memberships.ts.
 *
 * Row-wrapped scalars (the `row` fields are pure layout - Payload flattens
 * them onto this table, same as every row-wrapped collection since Phase 3)
 * plus two single-target relationship fields (`user` -> users, `tier` ->
 * membership-tiers), each a plain `<name>_id` FK column - the same mechanism
 * EventRSVPs' `event` column proved in Phase 2. createCollectionOps needs no
 * extra options.
 */
export type MembershipDoc = {
  id: number
  user: number
  tier: number
  status: string
  startedAt?: string | null
  renewsAt?: string | null
  trialEndsAt?: string | null
  cancelledAt?: string | null
  cancelAtPeriodEnd?: boolean | null
  externalSubscriptionId?: string | null
  externalCustomerId?: string | null
  welcomeEmailSentAt?: string | null
  expiryReminderSentAt?: string | null
  notes?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(memberships, Memberships)

export const findMemberships = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<MembershipDoc[]>
export const findMembershipByID = ops.findByID as unknown as (id: number) => Promise<MembershipDoc | null>
export const countMemberships = ops.count
export const createMembership = ops.create as unknown as (
  data: Partial<Omit<MembershipDoc, 'id' | 'updatedAt' | 'createdAt'>> & { user: number; tier: number },
) => Promise<MembershipDoc>
export const updateMembership = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<MembershipDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<MembershipDoc | null>
export const deleteMembership = ops.deleteByID
