import type { Payload } from 'payload'

import { sendAlreadyRegisteredEmail, sendResetEmail, sendWelcomeEmail } from './emails'
import { USERS_SLUG } from './types'

/**
 * Sign in, register, forgotten password, reset.
 *
 * Everything here is deliberately built on the engine's own auth primitives
 * rather than beside them:
 *
 *   - `login` counts failures on the user row, so the account lockout is
 *     durable and shared across isolates. A counter of our own could not be.
 *   - `forgotPassword` mints a random token, stores it with an expiry, and
 *     returns null for an address it does not recognise - never an error that
 *     would distinguish the two cases.
 *   - `resetPassword` matches the token against an unexpired row and sets the
 *     expiry to now as it succeeds, so a link works exactly once.
 *
 * Writing any of those by hand would mean a second, weaker copy of a thing the
 * platform already does correctly.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MIN_PASSWORD_LENGTH = 8

/** How long a reset link lives. Short enough to matter, long enough to use. */
export const RESET_TTL_MINUTES = 30

/**
 * One sentence for every failed sign-in, whatever went wrong.
 *
 * "No account with that email" and "wrong password" are two different answers,
 * and telling them apart is how an attacker builds a list of real customers
 * before guessing a single password.
 */
const SIGN_IN_FAILED = 'Those details do not match an account.'

export type SignInResult = { ok: boolean; token?: string; message?: string }

export const signIn = async (
  engine: Payload,
  email: string,
  password: string,
): Promise<SignInResult> => {
  const address = email.trim().toLowerCase()
  if (!address || !password) return { ok: false, message: SIGN_IN_FAILED }

  try {
    const result = await engine.login({
      collection: USERS_SLUG,
      data: { email: address, password },
    })
    if (!result.token) return { ok: false, message: SIGN_IN_FAILED }
    return { ok: true, token: result.token }
  } catch {
    // Includes a locked account. Saying so would confirm the address exists.
    return { ok: false, message: SIGN_IN_FAILED }
  }
}

/**
 * Confirms the person at the keyboard is the account holder, before an email
 * or password change.
 *
 * A sign-in attempt is the only honest way to check a password: the stored
 * value is a salted hash and the engine exposes no "is this the password"
 * call. Going through `login` also means a wrong answer here counts towards
 * the same lockout as a wrong answer on the sign-in form, which is the correct
 * behaviour for someone sitting at an unattended, still-signed-in browser
 * trying to guess their way into changing the password.
 */
export const verifyPassword = async (
  engine: Payload,
  email: string,
  password: string,
): Promise<boolean> => {
  if (!password) return false
  try {
    const result = await engine.login({
      collection: USERS_SLUG,
      data: { email: email.trim().toLowerCase(), password },
    })
    return Boolean(result.user)
  } catch {
    return false
  }
}

export type RegistrationOutcome = { created: boolean; userId: number | string | null }

/**
 * Creates a customer, or quietly does nothing if the address is taken.
 *
 * Both branches look identical to the caller on purpose - see the note on
 * `NEUTRAL_EMAIL_NOTICE`. The mailbox owner is the one told which of the two
 * happened, because they are the only person entitled to know.
 *
 * `overrideAccess: true` on the create is required and safe: the Users
 * collection only lets admins create, which is right for the admin area, and
 * this is the one server-controlled path that is allowed to make a customer.
 * The role is fixed here rather than read from the form, so registration can
 * never mint an admin.
 */
export const registerCustomer = async (
  engine: Payload,
  email: string,
  password: string,
  urls: { signIn: string; forgotPassword: string; account: string },
): Promise<RegistrationOutcome> => {
  const address = email.trim().toLowerCase()

  const existing = await engine
    .find({
      collection: USERS_SLUG,
      where: { email: { equals: address } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as unknown[] }))

  if (existing.docs.length > 0) {
    await sendAlreadyRegisteredEmail(address, urls.signIn, urls.forgotPassword).catch(
      (): undefined => undefined,
    )
    return { created: false, userId: null }
  }

  try {
    const user = (await engine.create({
      collection: USERS_SLUG,
      data: { email: address, password, roles: ['customer'] },
      overrideAccess: true,
    })) as { id: number | string }

    await sendWelcomeEmail(address, urls.account).catch((): undefined => undefined)
    return { created: true, userId: user.id }
  } catch {
    // A unique-constraint race lands here too, and is answered the same way.
    return { created: false, userId: null }
  }
}

/**
 * Mints a reset token and emails the link.
 *
 * Returns nothing about the address either way. The engine already fails
 * silently on an unknown one; this adds the matching silence on our side, so
 * that response timing is the only difference and no wording is.
 */
export const requestPasswordReset = async (
  engine: Payload,
  email: string,
  resetUrlFor: (token: string) => string,
): Promise<void> => {
  const address = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(address)) return

  const token = await engine
    .forgotPassword({
      collection: USERS_SLUG,
      data: { email: address },
      // The engine's own transport is not the one this site sends through -
      // Email settings are, so the message is composed and sent by us.
      disableEmail: true,
      expiration: RESET_TTL_MINUTES * 60 * 1000,
    })
    .catch((): null => null)

  if (!token) return

  await sendResetEmail(address, resetUrlFor(token), RESET_TTL_MINUTES).catch(
    (): undefined => undefined,
  )
}

export type ResetResult = { ok: boolean; message?: string }

export const completePasswordReset = async (
  engine: Payload,
  token: string,
  password: string,
): Promise<ResetResult> => {
  const problem = passwordProblem(password)
  if (problem) return { ok: false, message: problem }
  if (!token) return { ok: false, message: 'That reset link is not valid. Ask for a new one.' }

  try {
    await engine.resetPassword({
      collection: USERS_SLUG,
      data: { password, token },
      // The holder of a valid, unexpired token has proven control of the
      // mailbox; there is no session yet to check access against.
      overrideAccess: true,
    })
    return { ok: true }
  } catch {
    // Wrong token, used token, expired token - one answer for all three.
    return { ok: false, message: 'That reset link has expired or has already been used.' }
  }
}

export const emailProblem = (email: string): string | null =>
  EMAIL_PATTERN.test(email.trim()) ? null : 'That does not look like an email address.'

export const passwordProblem = (password: string): string | null => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}
