/**
 * The password rule types and their shipped defaults. Kept apart from
 * passwordPolicy.ts on purpose: the request middleware reads these settings
 * through security/settings.ts, and must not pull in node crypto or the auth
 * engine that passwordPolicy.ts needs.
 *
 * Every default reproduces what the site did before the rules existed.
 */

export type PasswordPolicy = {
  minLength: number
  requireMixedCase: boolean
  requireNumber: boolean
  requireSymbol: boolean
  blockCommon: boolean
  breachCheck: boolean
  historyCount: number
  maxAgeDays: number
}

/** The customer length floor that has always applied to registration, reset and change. */
export const SHIPPED_MIN_LENGTH = 8

/** How many previous password hashes are kept per account. The setting picks 0 to this. */
export const HISTORY_LIMIT = 10

/** Longest a password may be; a guard against a form posting something huge. */
export const MAX_POLICY_LENGTH = 128

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: SHIPPED_MIN_LENGTH,
  requireMixedCase: false,
  requireNumber: false,
  requireSymbol: false,
  blockCommon: false,
  breachCheck: false,
  historyCount: 0,
  maxAgeDays: 0,
}
