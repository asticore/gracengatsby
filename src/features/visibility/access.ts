/**
 * "Visible to signed-in accounts" and shared password group rules.
 *
 * A rule lives in eg_content_access (src/cms/db/passwordGroups.ts). This file answers two questions
 * and nothing else: does this visitor qualify for an accounts rule, and is a group still usable.
 * Everything is decided per request from the visitor's own session; nothing here is cached.
 */

import type { ContentAccessRule, PasswordGroupRow } from '@/cms/db/passwordGroups'
import { resolveEntitlement, type EngineQuery } from '@/features/members/entitlement'

export type ViewerUser = { id?: number | string | null; roles?: string[] | null } | null | undefined

/** Who is asking. `getEngine` is only called when a rule names membership tiers and the visitor is signed in. */
export type Viewer = {
  user: ViewerUser
  getEngine?: () => Promise<EngineQuery>
}

/**
 * True when the visitor satisfies an accounts rule. Fails closed: no user, no id, an unreadable
 * membership or a missing engine all mean "does not qualify". Admins always qualify (they must be able to
 * look at what they locked). Roles and tiers are alternatives: either match is enough; with neither
 * configured, any signed-in account qualifies.
 */
export async function viewerQualifies(rule: Pick<ContentAccessRule, 'mode' | 'roles' | 'tiers'>, viewer: Viewer | null | undefined): Promise<boolean> {
  if (rule.mode !== 'accounts') return false
  const user = viewer?.user
  if (!user || user.id === null || user.id === undefined || user.id === '') return false

  const roles = Array.isArray(user.roles) ? user.roles : []
  if (roles.includes('admin')) return true
  if (rule.roles.length === 0 && rule.tiers.length === 0) return true
  if (rule.roles.some((role) => roles.includes(role))) return true

  if (rule.tiers.length > 0 && viewer?.getEngine) {
    try {
      const entitlement = await resolveEntitlement(await viewer.getEngine(), user.id)
      const slug = entitlement.tier?.slug
      if (entitlement.rank > 0 && typeof slug === 'string' && rule.tiers.includes(slug)) return true
    } catch {
      return false
    }
  }
  return false
}

/** A group stops working once its expiry has passed. An unparseable expiry counts as expired. */
export function groupIsUsable(group: Pick<PasswordGroupRow, 'expiresAt'> | null | undefined, now = Date.now()): boolean {
  if (!group) return false
  if (!group.expiresAt) return true
  const at = Date.parse(group.expiresAt)
  return Number.isFinite(at) && at > now
}

/** The fingerprint a group token carries; changing the group's password changes it, so old cookies die. */
export const groupFingerprint = (group: Pick<PasswordGroupRow, 'hash'>): string => group.hash.slice(-16)
