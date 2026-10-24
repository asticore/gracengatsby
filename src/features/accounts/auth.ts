import type { Engine } from '@/engine'

import type { SessionClient } from '@/features/security/userSessions'

import {
  sendAlreadyRegisteredEmail,
  sendResetEmail,
  sendVerifyEmail,
  sendWelcomeEmail,
} from './emails'
import { USERS_SLUG, VERIFY_FIRST_MESSAGE } from './types'

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

/** How long an email verification link lives. */
export const VERIFY_TTL_HOURS = 24

export type SignInResult = {
  ok: boolean
  token?: string
  message?: string
  /** True when the password was right but the address is not yet verified. */
  needsVerification?: boolean
  /** True when the password was right and a two-step code is the next step. */
  needsTwoFactor?: boolean
  pendingToken?: string
}

// --- Email verification -----------------------------------------------------

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** SHA-256 of a token, hex. Only this is stored; the token lives in the email. */
export const hashVerifyToken = async (token: string): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))

/** Whether the site has switched verification on (off unless set). */
export const verificationRequired = async (engine: Engine): Promise<boolean> => {
  const settings = (await engine
    .findGlobal({ slug: 'site-settings', depth: 0 })
    .catch((): null => null)) as { accountSettings?: { requireEmailVerification?: boolean | null } | null } | null
  return settings?.accountSettings?.requireEmailVerification === true
}

/** Customer-only accounts: admins, editors and viewers are never gated. */
const isCustomerOnly = (roles: unknown): boolean =>
  Array.isArray(roles) && roles.length > 0 && roles.every((role) => role === 'customer')

/**
 * Mints a 32-byte token, stores its SHA-256 and a 24 hour expiry on the user,
 * and emails the link. Returns false if nothing could be stored.
 */
export const issueVerification = async (
  engine: Engine,
  userId: number | string,
  email: string,
  verifyUrlFor: (token: string) => string,
): Promise<boolean> => {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const expires = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000).toISOString()

  try {
    await engine.update({
      collection: USERS_SLUG,
      id: Number(userId),
      data: { emailVerifyTokenHash: await hashVerifyToken(token), emailVerifyExpiresAt: expires },
      overrideAccess: true,
    })
  } catch {
    return false
  }

  await sendVerifyEmail(email, verifyUrlFor(token), VERIFY_TTL_HOURS).catch((): undefined => undefined)
  return true
}

export type VerifyResult = { ok: boolean; message?: string }

const VERIFY_INVALID = 'That link has expired or has already been used.'

/** Consumes a token once: hash, match, check expiry, mark verified, clear. */
export const completeVerification = async (engine: Engine, token: string): Promise<VerifyResult> => {
  if (!token) return { ok: false, message: VERIFY_INVALID }
  try {
    const found = await engine.find({
      collection: USERS_SLUG,
      where: { emailVerifyTokenHash: { equals: await hashVerifyToken(token) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const user = found.docs[0] as { id: number | string; emailVerifyExpiresAt?: string | null } | undefined
    const expires = user?.emailVerifyExpiresAt ? Date.parse(user.emailVerifyExpiresAt) : NaN
    if (!user || !(expires > Date.now())) return { ok: false, message: VERIFY_INVALID }

    await engine.update({
      collection: USERS_SLUG,
      id: Number(user.id),
      data: {
        emailVerifiedAt: new Date().toISOString(),
        emailVerifyTokenHash: null,
        emailVerifyExpiresAt: null,
      },
      overrideAccess: true,
    })
    return { ok: true }
  } catch {
    return { ok: false, message: VERIFY_INVALID }
  }
}

/**
 * Sends a fresh link to an unverified, customer-only account. Silent for
 * every other case so the caller learns nothing about who has an account.
 */
export const resendVerification = async (
  engine: Engine,
  email: string,
  verifyUrlFor: (token: string) => string,
): Promise<void> => {
  const address = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(address)) return
  if (!(await verificationRequired(engine))) return

  const found = await engine
    .find({
      collection: USERS_SLUG,
      where: { email: { equals: address } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as unknown[] }))
  const user = found.docs[0] as
    | { id: number | string; roles?: unknown; emailVerifiedAt?: string | null }
    | undefined
  if (!user || user.emailVerifiedAt || !isCustomerOnly(user.roles)) return

  await issueVerification(engine, user.id, address, verifyUrlFor)
}

/** Customers who have not confirmed their address are held back, when the setting asks for it. */
const verificationBlock = async (engine: Engine, userId: number | string): Promise<SignInResult | null> => {
  if (!(await verificationRequired(engine))) return null
  const user = (await engine.findByID({
    collection: USERS_SLUG,
    id: Number(userId),
    depth: 0,
    overrideAccess: true,
  })) as { roles?: unknown; emailVerifiedAt?: string | null }
  if (isCustomerOnly(user.roles) && !user.emailVerifiedAt) {
    return { ok: false, message: VERIFY_FIRST_MESSAGE, needsVerification: true }
  }
  return null
}

export const signIn = async (
  engine: Engine,
  email: string,
  password: string,
  client?: SessionClient,
): Promise<SignInResult> => {
  const address = email.trim().toLowerCase()
  if (!address || !password) return { ok: false, message: SIGN_IN_FAILED }

  try {
    const result = await engine.login({
      collection: USERS_SLUG,
      data: { email: address, password },
      client,
    })

    // Confirmed two-step: the password was right, but no session exists until
    // a code is given. Only people who finished setup ever get here.
    if (result.twoFactorRequired && result.pendingToken) {
      return { ok: false, needsTwoFactor: true, pendingToken: result.pendingToken }
    }
    if (!result.token) return { ok: false, message: SIGN_IN_FAILED }

    // Checked only after the password was right, so this answer is shown to
    // the account holder and tells a stranger nothing.
    const blocked = await verificationBlock(engine, (result.user as { id: number | string }).id)
    if (blocked) return blocked
    return { ok: true, token: result.token }
  } catch {
    // Includes a locked account. Saying so would confirm the address exists.
    return { ok: false, message: SIGN_IN_FAILED }
  }
}

const CODE_FAILED = 'That code was not right, or the sign-in took too long. Start again if needed.'

/** Second step of a two-step customer sign-in: the pending token and a code. */
export const signInWithCode = async (
  engine: Engine,
  pendingToken: string,
  code: string,
  client?: SessionClient,
): Promise<SignInResult> => {
  if (!pendingToken || !code.trim()) return { ok: false, message: CODE_FAILED }

  try {
    const result = await engine.loginSecondFactor({
      collection: USERS_SLUG,
      data: { pendingToken, code: code.trim() },
      client,
    })
    if (!result.token) return { ok: false, message: CODE_FAILED }

    const blocked = await verificationBlock(engine, (result.user as { id: number | string }).id)
    if (blocked) return blocked
    return { ok: true, token: result.token }
  } catch {
    return { ok: false, message: CODE_FAILED }
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
  engine: Engine,
  email: string,
  password: string,
): Promise<boolean> => {
  if (!password) return false
  try {
    const result = await engine.login({
      collection: USERS_SLUG,
      data: { email: email.trim().toLowerCase(), password },
      // Only testing the password: do not leave a device session behind.
      client: { skipSession: true },
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
  engine: Engine,
  email: string,
  password: string,
  urls: { signIn: string; forgotPassword: string; account: string },
  verifyUrlFor?: (token: string) => string,
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

    if (verifyUrlFor && (await verificationRequired(engine))) {
      await issueVerification(engine, user.id, address, verifyUrlFor)
    }
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
  engine: Engine,
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
  engine: Engine,
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
      // No cookie is set from this, so no device session should be listed for it.
      client: { skipSession: true },
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
