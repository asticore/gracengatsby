import type { MemberSettings, MembershipDoc, MembershipStatus, MembershipTierDoc } from './types'
import type { EngineWrite } from './emails'

import { findTierBySlug } from './entitlement'
import { sendWelcomeEmail } from './emails'
import { MEMBERSHIPS_SLUG } from './slugs'

/**
 * Signing someone up as a member.
 *
 * Two accounts are never created: customers already live in the Users
 * collection (the shop plugin maps them onto it), so a visitor who has bought
 * something and now joins keeps the same login. Membership is a row alongside
 * that user, not a second identity.
 */

export type EngineSignup = EngineWrite & {
  create(args: {
    collection: string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }): Promise<unknown>
  collections?: Record<string, { config?: { auth?: unknown } }>
}

export type SignupRequest = {
  email: string
  password: string
  /** Overrides the default tier from settings. */
  tierSlug?: string
}

export type SignupResult =
  | { ok: true; userId: number | string; membershipId: number | string; needsPayment: boolean; verificationRequired: boolean }
  | { ok: false; reason: SignupFailure; error: string }

export type SignupFailure =
  | 'feature-off'
  | 'signup-closed'
  | 'invalid-email'
  | 'weak-password'
  | 'no-tier'
  | 'verification-unavailable'
  | 'already-registered'
  | 'failed'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * True when the Users collection is actually configured to send and check a
 * verification email.
 *
 * Checked rather than assumed, because the setting is a promise to the operator
 * and the mechanism lives on a collection this feature does not own. Turning
 * "require email verification" on while the collection cannot verify would give
 * every sign-up immediate access under a screen that says otherwise - so signup
 * refuses instead. See the integration note for the one line that fixes it.
 */
const canVerifyEmail = (engine: EngineSignup): boolean => {
  const auth = engine.collections?.users?.config?.auth
  return Boolean(auth && typeof auth === 'object' && (auth as { verify?: unknown }).verify)
}

/**
 * A free tier is live immediately; a paid one waits for money. Returning
 * `pending` for anything with a price is what stops a sign-up form from being a
 * way to get a paid membership for nothing.
 */
const initialStatus = (tier: MembershipTierDoc): MembershipStatus => {
  const price = typeof tier.price === 'number' ? tier.price : 0
  if (price <= 0) return 'active'
  if ((tier.trialDays ?? 0) > 0) return 'pending'
  return 'pending'
}

const addDays = (from: Date, days: number): string =>
  new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

export const registerMember = async (
  engine: EngineSignup,
  settings: MemberSettings,
  request: SignupRequest,
  now = new Date(),
): Promise<SignupResult> => {
  if (!settings.featureEnabled) {
    return { ok: false, reason: 'feature-off', error: 'Memberships are not switched on for this site.' }
  }
  if (!settings.registration.allowSignup) {
    return {
      ok: false,
      reason: 'signup-closed',
      error: 'Membership is invitation-only at the moment.',
    }
  }

  const email = request.email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, reason: 'invalid-email', error: 'That does not look like an email address.' }
  }
  if (!request.password || request.password.length < 8) {
    return { ok: false, reason: 'weak-password', error: 'Choose a password of at least 8 characters.' }
  }

  if (settings.registration.requireEmailVerification && !canVerifyEmail(engine)) {
    return {
      ok: false,
      reason: 'verification-unavailable',
      error:
        'Sign-up is unavailable: this site requires email verification, but the account system is not set up to send it.',
    }
  }

  const wantedSlug = request.tierSlug?.trim() || settings.registration.defaultTier
  const tier = wantedSlug ? await findTierBySlug(engine, wantedSlug) : null
  if (!tier) {
    return {
      ok: false,
      reason: 'no-tier',
      error: wantedSlug
        ? `There is no membership tier called "${wantedSlug}".`
        : 'No membership tier was chosen.',
    }
  }
  if (tier.active === false) {
    return { ok: false, reason: 'no-tier', error: `The ${tier.name} tier is not open to new members.` }
  }

  const { docs: existing } = await engine
    .find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
    .catch((): { docs: unknown[] } => ({ docs: [] }))

  if (existing.length > 0) {
    // Deliberately the same wording a caller should show for an unknown
    // address too - saying "that email already has an account" turns the signup
    // form into a way to test which addresses are registered.
    return {
      ok: false,
      reason: 'already-registered',
      error: 'If that address can be used, you will receive an email shortly.',
    }
  }

  let userId: number | string
  try {
    const user = (await engine.create({
      collection: 'users',
      data: { email, password: request.password, roles: ['customer'] },
      overrideAccess: true,
    })) as { id: number | string }
    userId = user.id
  } catch {
    return { ok: false, reason: 'failed', error: 'The account could not be created.' }
  }

  const status = initialStatus(tier)
  const trialDays = tier.trialDays ?? 0

  let membership: MembershipDoc
  try {
    membership = (await engine.create({
      collection: MEMBERSHIPS_SLUG,
      data: {
        user: userId,
        tier: tier.id,
        status,
        startedAt: now.toISOString(),
        ...(trialDays > 0 ? { trialEndsAt: addDays(now, trialDays) } : {}),
      },
      overrideAccess: true,
    })) as MembershipDoc
  } catch {
    return { ok: false, reason: 'failed', error: 'The membership could not be created.' }
  }

  // Only a membership that is already live gets welcomed. A paid one is
  // welcomed by the billing webhook, once the money has actually arrived.
  if (status === 'active') {
    await sendWelcomeEmail(
      engine,
      { ...membership, user: { id: userId, email }, tier },
      settings,
    ).catch((): undefined => undefined)
  }

  return {
    ok: true,
    userId,
    membershipId: membership.id,
    needsPayment: status === 'pending',
    verificationRequired: settings.registration.requireEmailVerification,
  }
}

/** Where a member should land after signing in, per settings. */
export const redirectAfterLogin = (settings: MemberSettings): string =>
  settings.access.redirectAfterLogin || '/account'

/** Where a non-member is sent when they open something locked, per settings. */
export const membersOnlyRedirect = (settings: MemberSettings, returnTo?: string): string => {
  const base = settings.access.membersOnlyRedirect || '/membership'
  if (!returnTo) return base
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}next=${encodeURIComponent(returnTo)}`
}
