import type { MembershipDoc, MembershipStatus, MembershipTierDoc } from './types'
import { MEMBERSHIPS_SLUG, MEMBERSHIP_TIERS_SLUG } from './slugs'

/**
 * "What is this person allowed to see?" - answered once, here, from the
 * database, so the gate, the account page and the billing screens can never
 * disagree about it.
 */

/**
 * The narrow slice of the engine this feature uses. Declared structurally so a
 * plain object can stand in for it in a test - the gate is the one piece of
 * this feature that must be provable without a running CMS.
 */
export type EngineQuery = {
  find(args: {
    collection: string
    where?: Record<string, unknown>
    limit?: number
    depth?: number
    overrideAccess?: boolean
    sort?: string
  }): Promise<{ docs: unknown[] }>
}

/** The two states that unlock content. Everything else withholds it. */
const ACCESS_GRANTING: MembershipStatus[] = ['active', 'trialing']

export const grantsAccess = (membership: Pick<MembershipDoc, 'status' | 'renewsAt'>, now = new Date()): boolean => {
  if (!ACCESS_GRANTING.includes(membership.status)) return false
  // A row left `active` past its renewal date is a row nobody got round to
  // expiring - a missed webhook, a failed cron. Treating the date as
  // authoritative means a lapsed member loses access on time rather than
  // keeping it until an admin notices.
  if (membership.renewsAt) {
    const renews = new Date(membership.renewsAt).getTime()
    if (Number.isFinite(renews) && renews < now.getTime()) return false
  }
  return true
}

export type Entitlement = {
  /** Highest rank currently unlocked. 0 means no membership at all. */
  rank: number
  membership: MembershipDoc | null
  tier: MembershipTierDoc | null
}

export const NO_ENTITLEMENT: Entitlement = { rank: 0, membership: null, tier: null }

const asTier = (value: unknown): MembershipTierDoc | null =>
  value && typeof value === 'object' && 'rank' in (value as object) ? (value as MembershipTierDoc) : null

/**
 * The membership that gives this user the most access right now.
 *
 * Reads with `overrideAccess` on purpose: the caller is the gate deciding what
 * to render, not the user asking to read their own row, and the collection's
 * read rule would otherwise hide a membership from an anonymous render path
 * that legitimately needs to check it. Nothing from the row is returned to the
 * browser by the gate - only the yes/no.
 */
export const resolveEntitlement = async (
  engine: EngineQuery,
  userId: number | string | null | undefined,
  now = new Date(),
): Promise<Entitlement> => {
  if (userId === null || userId === undefined || userId === '') return NO_ENTITLEMENT

  const { docs } = await engine
    .find({
      collection: MEMBERSHIPS_SLUG,
      where: { user: { equals: userId } },
      depth: 1,
      limit: 100,
      overrideAccess: true,
    })
    .catch((): { docs: unknown[] } => ({ docs: [] }))

  let best: Entitlement = NO_ENTITLEMENT

  for (const raw of docs as MembershipDoc[]) {
    if (!grantsAccess(raw, now)) continue
    const tier = asTier(raw.tier)
    const rank = typeof tier?.rank === 'number' ? tier.rank : 1
    if (rank >= best.rank) best = { rank, membership: raw, tier }
  }

  return best
}

/** Looks a tier up by its short name, which is how settings refer to tiers. */
export const findTierBySlug = async (
  engine: EngineQuery,
  slug: string,
): Promise<MembershipTierDoc | null> => {
  const wanted = slug.trim()
  if (!wanted) return null

  const { docs } = await engine
    .find({
      collection: MEMBERSHIP_TIERS_SLUG,
      where: { slug: { equals: wanted } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch((): { docs: unknown[] } => ({ docs: [] }))

  return (docs[0] as MembershipTierDoc) ?? null
}
