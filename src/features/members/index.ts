/**
 * Public surface of the Members feature. Everything outside this folder imports
 * from here, so the internal layout can change without touching the config, the
 * frontend pages or the API routes.
 *
 * `billing` and `webhooks` are NOT re-exported: both import the Stripe SDK, and
 * pulling that into the config's import graph would load it on every render of
 * every page, including the ones that have nothing to do with money. Import
 * them from '@/features/members/billing' and '@/features/members/webhooks'
 * where they are actually needed.
 */

export { MembershipTiers } from './collections/MembershipTiers'
export { Memberships } from './collections/Memberships'

export { membersOnlyField, type MembersOnlyValue } from './gateField'

export {
  MEMBERSHIPS_SLUG,
  MEMBERSHIPS_TABLE,
  MEMBERSHIP_TIERS_SLUG,
  MEMBERSHIP_TIERS_TABLE,
  MEMBERS_FEATURE_KEY,
  MEMBER_SETTINGS_SLUG,
} from './slugs'

export {
  DEFAULT_MEMBER_SETTINGS,
  type BillingInterval,
  type GateVerdict,
  type MemberSettings,
  type MembershipDoc,
  type MembershipStatus,
  type MembershipTierDoc,
  type TeaserMode,
} from './types'

export { getMemberSettings, membersEnabled, type EngineLike } from './settings'

export {
  NO_ENTITLEMENT,
  findTierBySlug,
  grantsAccess,
  resolveEntitlement,
  type Entitlement,
  type EngineQuery,
} from './entitlement'

export {
  applyGate,
  evaluateGate,
  gateDocument,
  type GateableDoc,
  type GatedDoc,
} from './gate'

export {
  membersOnlyRedirect,
  redirectAfterLogin,
  registerMember,
  type SignupRequest,
  type SignupResult,
} from './signup'

export { sendExpiryReminders, sendWelcomeEmail, type ReminderSweep } from './emails'

export { isAdminOrMembershipOwner, isMembersAdmin } from './access'
