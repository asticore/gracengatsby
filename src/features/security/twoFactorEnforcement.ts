import type { SecuritySettings } from './settings'

/**
 * Who must use two-step sign-in, and what happens to someone who has not set it up.
 *
 * Pure: no database, no request, no clock except the `now` argument, so the rules are
 * unit-testable and the edge middleware can import it.
 *
 * THE RULES
 *   - A user is covered when the Security feature is on and either a legacy checkbox
 *     (admins, members) or the role list names one of their roles. A role token is a
 *     built-in role (admin, editor, viewer, customer) or a custom role slug.
 *   - Covered and not enrolled means one of:
 *       grace      the grace period has not ended: reminded, nothing is blocked
 *       enforced   confined to the setup screen; the REST API and API keys refuse them
 *       exempt     the break-glass env variable ENGAGE_DISABLE_2FA_ENFORCEMENT is set
 *   - Nobody is ever locked out of enrolling. Enforcement never ends a session and never
 *     blocks the setup screen, sign-out, or the setup actions.
 *   - The last administrator is redirected to the setup screen like anyone else but the
 *     API is never refused for them, so automation keyed to the only admin account is
 *     not cut off by a setting they may have set themselves.
 *   - Recovery for an enrolled account that lost its device: a backup code at sign-in, an
 *     administrator's reset, or the env override above to get the site back first.
 */

export type EnforcementUser = {
  roles?: string[] | null
  customRoleSlug?: string | null
  twoFactorEnabled?: boolean | null
}

export type EnforcementState = 'off' | 'satisfied' | 'grace' | 'enforced' | 'exempt'

export type Enforcement = {
  required: boolean
  enrolled: boolean
  state: EnforcementState
  /** Set while `state` is 'grace'. */
  graceEndsAt: string | null
  /** True when the REST API should refuse this user until they enrol. */
  reject: boolean
  reason?: string
}

export const ENFORCEMENT_OVERRIDE_ENV = 'ENGAGE_DISABLE_2FA_ENFORCEMENT'

export const enforcementDisabledByEnv = (env: Record<string, string | undefined> = process.env): boolean =>
  /^(1|true|yes|on)$/i.test((env[ENFORCEMENT_OVERRIDE_ENV] ?? '').trim())

/** The role tokens a user answers to: built-in roles plus a custom role slug. Lower case. */
export const roleTokensOf = (user: EnforcementUser | null | undefined): string[] => {
  const tokens = new Set<string>()
  for (const role of user?.roles ?? []) if (typeof role === 'string') tokens.add(role.toLowerCase())
  if (typeof user?.customRoleSlug === 'string' && user.customRoleSlug) tokens.add(user.customRoleSlug.toLowerCase())
  return [...tokens]
}

const isAdmin = (user: EnforcementUser | null | undefined): boolean => Boolean(user?.roles?.includes('admin'))
const isMember = (user: EnforcementUser | null | undefined): boolean =>
  Array.isArray(user?.roles) && user.roles.length > 0 && user.roles.every((role) => role === 'customer')

/** Whether any setting asks this user for two-step, ignoring grace and enrolment. */
export function isCovered(user: EnforcementUser | null | undefined, settings: SecuritySettings): boolean {
  if (!user || !settings.featureEnabled) return false
  const admin = isAdmin(user)
  const member = !admin && isMember(user)
  if (admin && settings.loginProtection.requireTwoFactorForAdmins) return true
  if (member && settings.loginProtection.requireTwoFactorForMembers) return true
  const wanted = settings.twoFactor?.requiredRoles ?? []
  return roleTokensOf(user).some((token) => wanted.includes(token))
}

export function evaluateEnforcement(
  user: EnforcementUser | null | undefined,
  settings: SecuritySettings,
  options: { now?: number; soleAdmin?: boolean; env?: Record<string, string | undefined> } = {},
): Enforcement {
  const enrolled = Boolean(user?.twoFactorEnabled)
  if (!isCovered(user, settings)) {
    return { required: false, enrolled, state: 'off', graceEndsAt: null, reject: false }
  }
  if (enrolled) return { required: true, enrolled, state: 'satisfied', graceEndsAt: null, reject: false }

  if (enforcementDisabledByEnv(options.env)) {
    return { required: true, enrolled, state: 'exempt', graceEndsAt: null, reject: false, reason: `Enforcement is switched off by ${ENFORCEMENT_OVERRIDE_ENV}.` }
  }

  const now = options.now ?? Date.now()
  const graceMs = settings.twoFactor?.graceEndsAt ? Date.parse(settings.twoFactor.graceEndsAt) : NaN
  if (Number.isFinite(graceMs) && graceMs > now) {
    return {
      required: true,
      enrolled,
      state: 'grace',
      graceEndsAt: new Date(graceMs).toISOString(),
      reject: false,
      reason: 'Two-step sign-in is required for this account. Set it up before the grace period ends.',
    }
  }

  return {
    required: true,
    enrolled,
    state: 'enforced',
    graceEndsAt: null,
    reject: !(options.soleAdmin && isAdmin(user)),
    reason: 'Two-step sign-in is required for this account but has not been set up.',
  }
}

/**
 * Paths a REST request may use while confined, so setup, sign-out and the session lookup
 * keep working. Everything else is refused with 403 `TwoFactorRequired`.
 */
export function isEnrolmentSafeRoute(slug: readonly string[]): boolean {
  if (slug[0] !== 'users') return false
  const last = slug[slug.length - 1]
  return slug.length === 2 && ['me', 'logout', 'login', 'login-2fa', 'refresh-token'].includes(last)
}
