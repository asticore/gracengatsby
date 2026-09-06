import type { Where } from '@/engine'

import { MembershipTiers } from '@/features/members/collections/MembershipTiers'

import { createCollectionOps } from '../generic'
import { membershipTiers, membershipTiersBenefits } from '../schema'

/** Payload's document shape for the `membership-tiers` collection - see src/features/members/collections/MembershipTiers.ts. */
export type MembershipTierDoc = {
  id: number
  name: string
  active?: boolean | null
  slug?: string | null
  rank: number
  price?: number | null
  interval?: string | null
  trialDays?: number | null
  description?: string | null
  benefits?: { id: string; benefit?: string | null }[] | null
  stripePriceId?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(membershipTiers, MembershipTiers, { benefits: membershipTiersBenefits })

export const findMembershipTiers = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<MembershipTierDoc[]>
export const findMembershipTierByID = ops.findByID as unknown as (id: number) => Promise<MembershipTierDoc | null>
export const countMembershipTiers = ops.count
export const createMembershipTier = ops.create as unknown as (
  data: Partial<Omit<MembershipTierDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string },
) => Promise<MembershipTierDoc>
export const updateMembershipTier = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<MembershipTierDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<MembershipTierDoc | null>
export const deleteMembershipTier = ops.deleteByID
