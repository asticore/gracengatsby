/**
 * Slugs and table names live here on their own so that the collections, the
 * gate, the billing code and the migration all read the same strings. The
 * migration writes raw SQL against these tables, so a rename that only touched
 * a collection file would silently split the schema in two.
 */

export const MEMBERSHIP_TIERS_SLUG = 'membership-tiers'
export const MEMBERSHIPS_SLUG = 'memberships'
export const MEMBER_SETTINGS_SLUG = 'member-settings'

export const MEMBERSHIP_TIERS_TABLE = 'eg_membership_tiers'
export const MEMBERSHIPS_TABLE = 'eg_memberships'

export const MEMBERS_FEATURE_KEY = 'members' as const
