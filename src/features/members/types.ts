/**
 * The shapes the rest of the feature agrees on.
 *
 * These are hand-written rather than pulled from the generated types, because
 * the generated file only gains `MembershipTier` and `Membership` once the
 * collections are registered in the config - and the gate has to compile before
 * that integration step happens.
 */

export type BillingInterval = 'one-time' | 'monthly' | 'quarterly' | 'yearly'

/**
 * `active` and `trialing` both grant access. Everything else withholds it -
 * see `grantsAccess`, which is the single place that decision is made.
 */
export type MembershipStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'past-due'
  | 'cancelled'
  | 'expired'

export type TeaserMode = 'full-hide' | 'excerpt' | 'blur'

export type MembershipTierDoc = {
  id: number | string
  name: string
  slug: string
  /** Major units (dollars, not cents) - the admin screen asks for dollars. */
  price?: number | null
  interval?: BillingInterval | null
  trialDays?: number | null
  /**
   * Higher unlocks everything a lower rank unlocks. Kept as a plain number so
   * tiers can be reordered without rewriting every gated document.
   */
  rank?: number | null
  active?: boolean | null
  description?: string | null
  benefits?: { benefit?: string | null }[] | null
  stripePriceId?: string | null
}

export type MembershipDoc = {
  id: number | string
  user: number | string | { id: number | string; email?: string }
  tier: number | string | MembershipTierDoc
  status: MembershipStatus
  startedAt?: string | null
  renewsAt?: string | null
  cancelledAt?: string | null
  trialEndsAt?: string | null
  externalSubscriptionId?: string | null
  externalCustomerId?: string | null
  cancelAtPeriodEnd?: boolean | null
  welcomeEmailSentAt?: string | null
  expiryReminderSentAt?: string | null
}

export type MemberSettings = {
  featureEnabled: boolean
  registration: {
    allowSignup: boolean
    requireEmailVerification: boolean
    defaultTier: string
  }
  access: {
    redirectAfterLogin: string
    membersOnlyRedirect: string
    teaserMode: TeaserMode
  }
  billing: {
    currency: string
    allowCancellation: boolean
    proration: boolean
  }
  emails: {
    welcomeSubject: string
    welcomeBody: string
    expiryReminderDays: number
  }
}

export const DEFAULT_MEMBER_SETTINGS: MemberSettings = {
  featureEnabled: false,
  registration: { allowSignup: false, requireEmailVerification: true, defaultTier: '' },
  access: {
    redirectAfterLogin: '/account',
    membersOnlyRedirect: '/membership',
    teaserMode: 'excerpt',
  },
  billing: { currency: 'AUD', allowCancellation: true, proration: true },
  emails: { welcomeSubject: 'Welcome aboard', welcomeBody: '', expiryReminderDays: 7 },
}

/** What a gated document looks like to whoever is asking for it. */
export type GateVerdict = {
  /** False when the reader may not see the full content. */
  allowed: boolean
  /** True when this document is gated at all. */
  gated: boolean
  /** How to present a withheld document, from settings. Null when allowed. */
  teaser: TeaserMode | null
  /** Where to send someone who is not allowed in, from settings. */
  redirectTo: string
  /** Slug of the tier required, for the "you need X" message. */
  requiredTierSlug: string | null
  requiredTierName: string | null
  /** Plain-language reason, safe to show a visitor. */
  reason:
    | 'not-gated'
    | 'feature-off'
    | 'member'
    | 'admin'
    | 'not-signed-in'
    | 'no-membership'
    | 'tier-too-low'
}
