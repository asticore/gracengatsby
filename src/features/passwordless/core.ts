import type { Engine } from '@/engine'
import type { SessionClient } from '@/features/security/userSessions'
import type { PasswordlessSettings } from '@/features/security/settings'
import { NEUTRAL_EMAIL_NOTICE, USERS_SLUG } from '@/features/accounts/types'

import { MAX_CODE_ATTEMPTS, checkCode, codeHash, newCode, randomHex, sha256Hex } from './tokens'
import type { LoginKind, LoginTokenRow, LoginTokenStore } from './store'

/**
 * Passwordless sign-in: an emailed link (one click) or a six-digit code.
 *
 * Four rules hold throughout.
 *   1. A request answers the same way whether or not the address has an account.
 *      The work done for an unknown address is roughly the same as for a known one.
 *   2. Only the newest link or code for an account works. A new request ends the old one.
 *   3. Every token is single use and expires; the code also dies after five wrong tries.
 *   4. The session is made by the engine's own `loginAsUser`, so a locked account is
 *      refused and a two-step account is still asked for its code.
 *
 * Nothing here reads a form or a URL for who the caller is. The identity comes from
 * the token row (link) or the email plus the code (code), and the role check is done
 * again at the point of sign-in.
 */

export type PasswordlessAuditAction = 'passwordless.requested' | 'passwordless.login' | 'passwordless.refused'

export type PasswordlessDeps = {
  engine: Engine
  store: LoginTokenStore
  settings: PasswordlessSettings
  /** Whether the site requires customers to confirm their address. */
  verificationRequired: boolean
  mail: {
    magicLink(to: string, link: string, minutes: number): Promise<unknown>
    loginCode(to: string, code: string, minutes: number): Promise<unknown>
  }
  audit?: (action: PasswordlessAuditAction, detail: string, userId?: number) => Promise<void>
  now?: () => number
  client?: SessionClient
}

export type RequestOutcome = { ok: boolean; message: string }

export type VerifyOutcome =
  | { status: 'ok'; token: string }
  | { status: 'two-factor'; pendingToken: string }
  | { status: 'refused'; message: string }

export const NEUTRAL_MESSAGE = NEUTRAL_EMAIL_NOTICE
export const DISABLED_MESSAGE = 'That way of signing in is not turned on for this site.'
export const REFUSED_MESSAGE = 'That sign-in link or code is not valid. It may have expired or been used already. Ask for a new one.'

type UserDoc = { id: number | string; email?: string; roles?: unknown; emailVerifiedAt?: string | null; lockUntil?: string | null }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const enabledFor = (settings: PasswordlessSettings, kind: LoginKind): boolean =>
  kind === 'link' ? settings.magicLinkEnabled : settings.emailCodeEnabled

/** Customers always; admins only when the owner allowed it. Editors and viewers never. */
export const eligibleRoles = (roles: unknown, allowAdmins: boolean): boolean => {
  if (!Array.isArray(roles) || roles.length === 0) return false
  if (roles.every((role) => role === 'customer')) return true
  return allowAdmins && roles.includes('admin')
}

const isLocked = (lockUntil: string | null | undefined, now: number): boolean =>
  Boolean(lockUntil) && new Date(lockUntil as string).getTime() > now

const findUserByEmail = async (engine: Engine, address: string): Promise<UserDoc | null> => {
  const found = await engine
    .find({ collection: USERS_SLUG, where: { email: { equals: address } }, limit: 1, depth: 0, overrideAccess: true })
    .catch(() => ({ docs: [] as unknown[] }))
  return (found.docs[0] as UserDoc | undefined) ?? null
}

const findUserById = async (engine: Engine, id: number): Promise<UserDoc | null> =>
  ((await engine
    .findByID({ collection: USERS_SLUG, id, depth: 0, overrideAccess: true })
    .catch((): null => null)) as UserDoc | null) ?? null

/** A user who may be sent a link or code right now. Lock and verification are checked here and again at sign-in. */
const mayReceive = (user: UserDoc, deps: PasswordlessDeps, now: number): boolean => {
  if (!eligibleRoles(user.roles, deps.settings.allowForAdmins)) return false
  if (isLocked(user.lockUntil, now)) return false
  // A customer who has not confirmed their address waits until they do, when the site asks for it.
  const isCustomer = Array.isArray(user.roles) && user.roles.every((role) => role === 'customer')
  if (deps.verificationRequired && isCustomer && !user.emailVerifiedAt) return false
  return true
}

/** Roughly the same work for an address with no account, so the response time does not tell them apart. */
const dummyWork = async (): Promise<void> => {
  await sha256Hex(randomHex(32))
  await codeHash(newCode())
}

/**
 * Asks for a link or a code. Always answers `ok` with the neutral sentence for any
 * address that is well formed, whether or not an account exists. Only a request for
 * a way of signing in that the owner has not switched on is refused outright.
 */
export async function requestLogin(
  deps: PasswordlessDeps,
  input: { email: string; kind: LoginKind; linkFor?: (token: string) => string },
): Promise<RequestOutcome> {
  if (!enabledFor(deps.settings, input.kind)) return { ok: false, message: DISABLED_MESSAGE }

  const now = deps.now ? deps.now() : Date.now()
  const address = input.email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(address)) {
    await dummyWork()
    return { ok: true, message: NEUTRAL_MESSAGE }
  }

  const user = await findUserByEmail(deps.engine, address)
  if (!user || !mayReceive(user, deps, now)) {
    await dummyWork()
    return { ok: true, message: NEUTRAL_MESSAGE }
  }

  const userId = Number(user.id)
  const nowIso = new Date(now).toISOString()
  const expiresAt = new Date(now + deps.settings.tokenMinutes * 60_000).toISOString()
  await deps.store.invalidateOpen(userId, nowIso)

  if (input.kind === 'link') {
    const token = randomHex(32)
    await deps.store.insert({ userId, kind: 'link', tokenHash: await sha256Hex(token), createdAt: nowIso, expiresAt })
    const link = input.linkFor ? input.linkFor(token) : token
    await deps.mail.magicLink(address, link, deps.settings.tokenMinutes).catch((): undefined => undefined)
  } else {
    const code = newCode()
    await deps.store.insert({ userId, kind: 'code', tokenHash: await codeHash(code), createdAt: nowIso, expiresAt })
    await deps.mail.loginCode(address, code, deps.settings.tokenMinutes).catch((): undefined => undefined)
  }

  await deps.audit?.('passwordless.requested', input.kind, userId)
  return { ok: true, message: NEUTRAL_MESSAGE }
}

const tokenLive = (row: LoginTokenRow | null, now: number): row is LoginTokenRow =>
  Boolean(row) && !row!.usedAt && new Date(row!.expiresAt).getTime() > now

/**
 * Read-only check used when the link page opens. It never consumes the token, so a
 * mail scanner or a link preview that fetches the URL cannot burn it. Only the
 * confirm button, a POST, does that.
 */
export async function inspectLink(deps: PasswordlessDeps, token: string): Promise<boolean> {
  if (!deps.settings.magicLinkEnabled || !token) return false
  const now = deps.now ? deps.now() : Date.now()
  const row = await deps.store.findByHash('link', await sha256Hex(token))
  return tokenLive(row, now)
}

/** The confirm button. Consumes the link exactly once, then signs in through the engine. */
export async function confirmLink(deps: PasswordlessDeps, token: string): Promise<VerifyOutcome> {
  if (!deps.settings.magicLinkEnabled || !token) return refuse(deps, 'link')
  const now = deps.now ? deps.now() : Date.now()
  const row = await deps.store.findByHash('link', await sha256Hex(token))
  if (!tokenLive(row, now)) return refuse(deps, 'link')
  return finish(deps, row, now)
}

/** The six-digit code, typed with the email address it was sent to. */
export async function verifyCode(deps: PasswordlessDeps, email: string, code: string): Promise<VerifyOutcome> {
  if (!deps.settings.emailCodeEnabled) return refuse(deps, 'code')
  const now = deps.now ? deps.now() : Date.now()
  const address = email.trim().toLowerCase()
  const user = EMAIL_PATTERN.test(address) ? await findUserByEmail(deps.engine, address) : null
  const row = user ? await deps.store.findLatestOpen(Number(user.id), 'code') : null
  if (!user || !tokenLive(row, now) || row.attempts >= MAX_CODE_ATTEMPTS) {
    await dummyWork()
    return refuse(deps, 'code', user ? Number(user.id) : undefined)
  }

  const trimmed = code.trim()
  if (!(await checkCode(row.tokenHash, trimmed))) {
    const attempts = row.attempts + 1
    await deps.store.setAttempts(row.id, attempts)
    // The last allowed wrong try kills the code outright, so it cannot be guessed on.
    if (attempts >= MAX_CODE_ATTEMPTS) await deps.store.consume(row.id, new Date(now).toISOString())
    return refuse(deps, 'code', Number(user.id))
  }
  return finish(deps, row, now)
}

/** Shared by link and code once the token has been proven: consume, re-check the account, sign in. */
const finish = async (deps: PasswordlessDeps, row: LoginTokenRow, now: number): Promise<VerifyOutcome> => {
  const nowIso = new Date(now).toISOString()
  // Consumed first: two clicks or two submits cannot both succeed.
  const won = await deps.store.consume(row.id, nowIso)
  if (!won) return refuse(deps, row.kind, row.userId)

  const user = await findUserById(deps.engine, row.userId)
  if (!user || !eligibleRoles(user.roles, deps.settings.allowForAdmins) || isLocked(user.lockUntil, now)) {
    return refuse(deps, row.kind, row.userId)
  }

  // The token proves control of the mailbox, so the address counts as confirmed.
  if (!user.emailVerifiedAt) {
    await deps.engine
      .update({ collection: USERS_SLUG, id: row.userId, data: { emailVerifiedAt: nowIso }, overrideAccess: true })
      .catch((): undefined => undefined)
  }

  let result: { token?: string; twoFactorRequired?: boolean; pendingToken?: string }
  try {
    result = await deps.engine.loginAsUser({
      collection: USERS_SLUG,
      id: row.userId,
      client: deps.client,
    } as never)
  } catch {
    // Includes a lock that tripped between the checks above.
    return refuse(deps, row.kind, row.userId)
  }

  if (result.twoFactorRequired && result.pendingToken) {
    await deps.audit?.('passwordless.login', `${row.kind}: two-step code next`, row.userId)
    return { status: 'two-factor', pendingToken: result.pendingToken }
  }
  if (!result.token) return refuse(deps, row.kind, row.userId)
  await deps.audit?.('passwordless.login', row.kind, row.userId)
  return { status: 'ok', token: result.token }
}

const refuse = async (deps: PasswordlessDeps, kind: LoginKind, userId?: number): Promise<VerifyOutcome> => {
  await deps.audit?.('passwordless.refused', kind, userId)
  return { status: 'refused', message: REFUSED_MESSAGE }
}

/** Whether a `next` value is one of our own sign-in landing pages. Anything else becomes /account. */
export const safeLandingPath = (value: string | null | undefined): string => {
  const next = typeof value === 'string' ? value : ''
  const own = next.startsWith('/account') || next.startsWith('/admin')
  return own && !next.startsWith('//') && !next.includes('\\') ? next : '/account'
}
