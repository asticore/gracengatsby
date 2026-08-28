import type { SecuritySettings } from './settings'

/**
 * Login attempt limiting, lockout, and the session cap.
 *
 * ON THE RIGHT LEVER FOR LOCKOUT
 *
 * The engine already has per-account attempt counting built into auth
 * collections: `maxLoginAttempts` and `lockTime`. It stores the failure count
 * and the lock expiry on the user row, so it is durable, shared across every
 * isolate, and immune to the client changing address - which an in-memory or
 * per-address counter of our own could never be. Building a parallel one would
 * be strictly worse. So the account lockout IS the engine's, and this module's
 * job is to feed it the numbers from the settings screen and to add the one
 * thing it structurally cannot do.
 *
 * What it cannot do: a per-account counter never sees one address trying one
 * password against a thousand accounts. Nothing locks, because no account
 * reaches its own threshold. That is what the per-address login budget in
 * rateLimit.ts covers, and why both exist.
 *
 * THE CATCH, STATED PLAINLY
 *
 * `maxLoginAttempts` and `lockTime` are read when the config is built, at
 * module load, long before any database is reachable. They cannot be read from
 * a global that lives in that database. `loginProtectionAuth()` therefore takes
 * its values from the environment, and the settings screen's two fields are
 * reconciled by `syncLoginProtectionToEnv()` - a hook that warns when the saved
 * values and the deployed ones disagree, rather than pretending the save took
 * effect. Changing them for real is an environment change and a redeploy.
 */

export type LoginProtectionAuth = {
  maxLoginAttempts: number
  lockTime: number
  tokenExpiration: number
}

const ENV_MAX_ATTEMPTS = 'ENGAGE_MAX_LOGIN_ATTEMPTS'
const ENV_LOCKOUT_MINUTES = 'ENGAGE_LOCKOUT_MINUTES'
const ENV_SESSION_MINUTES = 'ENGAGE_SESSION_TIMEOUT_MINUTES'

const envNumber = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * The auth block for the admin user collection. Spread into `Users`, replacing
 * `auth: true`.
 */
export function loginProtectionAuth(): LoginProtectionAuth {
  const maxLoginAttempts = envNumber(ENV_MAX_ATTEMPTS, 5)
  const lockoutMinutes = envNumber(ENV_LOCKOUT_MINUTES, 15)
  const sessionMinutes = envNumber(ENV_SESSION_MINUTES, 720)

  return {
    maxLoginAttempts,
    lockTime: lockoutMinutes * 60 * 1000,
    tokenExpiration: sessionMinutes * 60,
  }
}

/** True when the deployed numbers no longer match what the settings screen says. */
export function loginProtectionDrift(settings: SecuritySettings): string[] {
  const deployed = loginProtectionAuth()
  const drift: string[] = []

  if (deployed.maxLoginAttempts !== settings.loginProtection.maxLoginAttempts) {
    drift.push(
      `Failed sign-in limit is set to ${settings.loginProtection.maxLoginAttempts} but ${deployed.maxLoginAttempts} is deployed - set ${ENV_MAX_ATTEMPTS} and redeploy.`,
    )
  }

  if (deployed.lockTime !== settings.loginProtection.lockoutMinutes * 60 * 1000) {
    drift.push(
      `Lockout is set to ${settings.loginProtection.lockoutMinutes} minutes but ${deployed.lockTime / 60000} is deployed - set ${ENV_LOCKOUT_MINUTES} and redeploy.`,
    )
  }

  if (deployed.tokenExpiration !== settings.loginProtection.sessionTimeoutMinutes * 60) {
    drift.push(
      `Sign-in length is set to ${settings.loginProtection.sessionTimeoutMinutes} minutes but ${deployed.tokenExpiration / 60} is deployed - set ${ENV_SESSION_MINUTES} and redeploy.`,
    )
  }

  return drift
}

// --- Session cap ------------------------------------------------------------

/**
 * The session cookie's name is fixed by the framework's cookie prefix, which
 * this project leaves at its default.
 */
export const SESSION_COOKIE = 'payload-token'

type TokenClaims = { iat?: number; exp?: number }

/**
 * Reads the issued-at claim without verifying the signature.
 *
 * Not verifying is correct here and not a shortcut. This check can only ever
 * REJECT a session earlier than the engine would; the engine still verifies
 * the signature itself before honouring the token for anything. A forged token
 * gains nothing by claiming a recent issue time, because it fails verification
 * one layer down. Verifying here would mean handling the signing secret in the
 * request middleware for no additional guarantee.
 */
export function tokenIssuedAt(token: string): number | null {
  try {
    const payloadSegment = token.split('.')[1]
    if (!payloadSegment) return null

    const normalised = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '='))
    const claims = JSON.parse(json) as TokenClaims

    return typeof claims.iat === 'number' ? claims.iat * 1000 : null
  } catch {
    return null
  }
}

/**
 * True when the session has outlived the configured window.
 *
 * This is an absolute cap measured from sign-in, not an idle timeout. An idle
 * timeout needs a last-seen timestamp written on every request, which on this
 * stack means a database write per request; the setting is measured in hours,
 * where the difference between the two rarely matters, so it buys correctness
 * that nobody would notice at a cost everybody would.
 */
export function isSessionExpired(token: string, settings: SecuritySettings, now = Date.now()): boolean {
  if (!settings.featureEnabled) return false

  const issuedAt = tokenIssuedAt(token)
  if (issuedAt === null) return false

  const maxAgeMs = settings.loginProtection.sessionTimeoutMinutes * 60 * 1000
  return now - issuedAt > maxAgeMs
}
