import type { Payload } from 'payload'

import {
  DEFAULT_SECURITY_SETTINGS,
  getSecuritySettings,
  hit,
  limitFor,
} from '@/features/security'

/**
 * The per-address budget on the three unauthenticated endpoints: sign in,
 * request a reset, register.
 *
 * These are the only places where an anonymous caller can probe authenticated
 * state, so they are limited even when the Security feature's own rate
 * limiting is switched off - `limitFor` returns null in that case, and the
 * floor below takes over. Turning off a headers-and-hardening screen should
 * not silently open the sign-in form to unlimited guessing.
 *
 * The counter is per-isolate, not global; see the note at the top of
 * security/rateLimit.ts for exactly what that is and is not worth. The durable
 * control on guessing one account's password remains the engine's own lockout,
 * which counts failures on the user row.
 */

const FLOOR = Math.max(5, DEFAULT_SECURITY_SETTINGS.loginProtection.maxLoginAttempts * 2)

export type Attempt = 'sign-in' | 'reset' | 'register'

/**
 * Optional rather than discriminated fields, because this project compiles
 * with `strictNullChecks` off, where a union keyed on a boolean literal does
 * not narrow. Same shape reasoning applies to the other outcome types in this
 * feature.
 */
export type Guard = { allowed: boolean; retryAfterSeconds?: number }

export const guardAttempt = async (
  engine: Payload,
  attempt: Attempt,
  address: string,
): Promise<Guard> => {
  const settings = await getSecuritySettings(engine as never).catch(() => DEFAULT_SECURITY_SETTINGS)
  const limit = limitFor(settings, 'login') ?? FLOOR

  // Separate buckets per attempt type: someone registering should not be
  // spending the same allowance as someone mistyping their password.
  const decision = hit(`account:${attempt}:${address}`, limit)

  return decision.limited
    ? { allowed: false, retryAfterSeconds: decision.retryAfterSeconds }
    : { allowed: true }
}

export const tooManyAttempts = (retryAfterSeconds: number): string =>
  `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`
