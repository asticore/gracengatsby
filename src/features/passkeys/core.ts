import type { PasskeySettings } from '@/features/security/settings'
import { deviceLabelFromUserAgent } from '@/features/security/userSessions'
import { eligibleRoles } from '@/features/passwordless/core'

import { readChallenge, issueChallenge } from './challenge'
import { bytesEqual, fromBase64Url, toBase64Url, utf8 } from './encoding'
import { type PasskeyRow, type PasskeyStore } from './store'
import {
  FLAG_AT,
  FLAG_BS,
  decodeAttestationObject,
  checkRpId,
  importCoseKey,
  parseAuthData,
  parseClientData,
  requireUserPresence,
  userVerified,
  verifyAssertionSignature,
  WebAuthnError,
} from './webauthn'

/**
 * Passkeys (WebAuthn): registration and sign-in ceremonies, listing, renaming and removal.
 *
 * Four rules hold throughout.
 *   1. A passkey is an ADDITIONAL way in. Nothing here locks an account, changes the
 *      password, or makes a passkey the only method. Removing the last way in is refused.
 *   2. A ceremony signs a fresh challenge that was issued to this browser (signed cookie,
 *      five minutes). The origin and rpId come from the site, never from the request body.
 *   3. Sign-in ends in the engine's own `loginAsUser`, so a locked account is refused and a
 *      two-step account is still asked for its code - EXCEPT when the passkey itself proved
 *      the user (user verification performed). Then the TOTP step is skipped, because a
 *      device PIN or biometric plus the possession of the key is already a strong factor.
 *      A passkey signed in without user verification still gets the TOTP step if enrolled.
 *      The skip is decided here, nowhere else, and recorded in the audit detail.
 *   4. Registration and removal re-check the person: a password or a two-step code when the
 *      account has a password. A stolen session alone cannot add a passkey.
 */

export const PASSKEY_DISABLED_MESSAGE = 'Passkeys are not turned on for this site.'
export const PASSKEY_REFUSED_MESSAGE = 'That passkey could not sign you in. Try again, or use another way to sign in.'
export const PASSKEY_REGISTER_REFUSED = 'The passkey could not be added. Try again.'
export const PASSKEY_REAUTH_MESSAGE = 'Confirm it is you with your password or your authenticator code first.'
export const PASSKEY_LAST_METHOD_MESSAGE = 'This is your last way to sign in. Add a password or another sign-in method before removing it.'

const TIMEOUT_MS = 5 * 60 * 1000
const MAX_LABEL = 60

export type PasskeyUser = { id: number; email: string; name?: string | null; roles?: unknown; lockUntil?: string | null }

export type PasskeyAuditAction = 'passkey.registered' | 'passkey.login' | 'passkey.removed' | 'passkey.refused'

export type PasskeyLoginResult =
  | { status: 'ok'; token: string }
  | { status: 'two-factor'; pendingToken: string }
  | { status: 'refused'; message: string }

export type PasskeyDeps = {
  now: () => number
  /** ENGAGE_SECRET. Empty means passkeys cannot run; every ceremony is refused. */
  secret: string
  /** The site origin, e.g. https://example.com. Compared exactly with clientDataJSON.origin. */
  origin: string
  /** The host the credentials are scoped to. SHA-256 of this must equal authData's rpIdHash. */
  rpId: string
  /** Name shown in the device prompt. */
  rpName: string
  settings: PasskeySettings
  store: PasskeyStore
  findUser: (id: number) => Promise<PasskeyUser | null>
  /** Session for an identity the passkey has proven. Throws when the account is locked. */
  loginAsUser: (userId: number, skipSecondFactor: boolean) => Promise<{ token?: string; twoFactorRequired?: boolean; pendingToken?: string }>
  /** Password or two-step code for registration and removal. True when the person is confirmed. */
  reauthenticate: (userId: number, data: { password?: string; code?: string }) => Promise<boolean>
  /** True when the account has another way in: a password, a linked social identity, or an emailed link or code. */
  hasOtherSignInMethod: (userId: number) => Promise<boolean>
  audit: (action: PasskeyAuditAction, detail: string, userId?: number) => Promise<void>
  userAgent?: string | null
}

export type ChallengeOutcome = { ok: boolean; options?: Record<string, unknown>; cookie?: string; message?: string; status?: number }

export type RegisterOutcome = { ok: boolean; id?: number; message?: string; status?: number }

const refuse = (message: string, status = 400) => ({ ok: false as const, message, status })

/** Only the two WebAuthn record shapes this module reads. Everything else in a body is ignored. */
type RegisterBody = { id?: unknown; rawId?: unknown; response?: { clientDataJSON?: unknown; attestationObject?: unknown; transports?: unknown }; label?: unknown; password?: unknown; code?: unknown }
type LoginBody = { id?: unknown; rawId?: unknown; response?: { clientDataJSON?: unknown; authenticatorData?: unknown; signature?: unknown; userHandle?: unknown } }

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A label a person typed: no control characters, trimmed, capped. Empty means "use the device name". */
export const cleanLabel = (value: unknown): string =>
  str(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_LABEL)

const KNOWN_TRANSPORTS = new Set(['usb', 'nfc', 'ble', 'internal', 'hybrid'])
const transportsFrom = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && KNOWN_TRANSPORTS.has(item)).slice(0, 5) : []

const isLocked = (lockUntil: string | null | undefined, now: number): boolean => {
  if (!lockUntil) return false
  const until = Date.parse(lockUntil)
  return Number.isFinite(until) && until > now
}

const featureReady = (deps: PasskeyDeps): boolean => deps.settings.enabled && deps.secret.length > 0

/** Passkeys are for customers, and for admins only when the owner says so. Editors and viewers never. */
export const passkeyRoleAllowed = (user: PasskeyUser, deps: Pick<PasskeyDeps, 'settings'>): boolean =>
  eligibleRoles(user.roles, deps.settings.allowAdmins)

// --- Registration -----------------------------------------------------------

/** Creation options for a signed-in person, and the challenge cookie that must come back with the answer. */
export async function registrationOptions(deps: PasskeyDeps, user: PasskeyUser): Promise<ChallengeOutcome> {
  if (!featureReady(deps)) return refuse(PASSKEY_DISABLED_MESSAGE, 404)
  if (!passkeyRoleAllowed(user, deps) || isLocked(user.lockUntil, deps.now())) return refuse(PASSKEY_REGISTER_REFUSED, 403)
  const { challenge, cookie } = await issueChallenge(deps.secret, 'register', user.id, deps.now())
  const existing = await deps.store.listForUser(user.id)
  return {
    ok: true,
    cookie,
    options: {
      challenge,
      rp: { id: deps.rpId, name: deps.rpName },
      user: { id: toBase64Url(utf8(String(user.id))), name: user.email, displayName: user.name || user.email },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: TIMEOUT_MS,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: deps.settings.userVerification,
      },
      excludeCredentials: existing.map((row) => ({ type: 'public-key', id: row.credentialId, transports: row.transports })),
    },
  }
}

/** Checks the registration answer and stores the public key. Re-authentication is required before any of this runs. */
export async function registerPasskey(
  deps: PasskeyDeps,
  user: PasskeyUser,
  body: RegisterBody,
  cookie: string | null | undefined,
): Promise<RegisterOutcome> {
  if (!featureReady(deps)) return refuse(PASSKEY_DISABLED_MESSAGE, 404)
  if (!passkeyRoleAllowed(user, deps) || isLocked(user.lockUntil, deps.now())) return refuse(PASSKEY_REGISTER_REFUSED, 403)

  const confirmed = await deps.reauthenticate(user.id, { password: str(body.password), code: str(body.code) })
  if (!confirmed) return refuse(PASSKEY_REAUTH_MESSAGE, 403)

  const issued = await readChallenge(deps.secret, cookie, 'register', deps.now())
  if (!issued || issued.userId !== user.id) return refuse(PASSKEY_REGISTER_REFUSED, 400)

  try {
    const idBytes = fromBase64Url(str(body.id))
    const rawBytes = fromBase64Url(str(body.rawId))
    const clientDataJSON = fromBase64Url(str(body.response?.clientDataJSON))
    const attestation = fromBase64Url(str(body.response?.attestationObject))
    if (!idBytes || !rawBytes || !clientDataJSON || !attestation || !bytesEqual(idBytes, rawBytes)) throw new WebAuthnError('malformed')

    parseClientData(clientDataJSON, { type: 'webauthn.create', challenge: issued.challenge, origin: deps.origin })
    const { fmt, authData: rawAuthData } = decodeAttestationObject(attestation)
    if (fmt !== 'none') throw new WebAuthnError('only attestation none is accepted')

    const auth = parseAuthData(rawAuthData)
    requireUserPresence(auth.flags)
    await checkRpId(auth.rpIdHash, deps.rpId)
    if (!(auth.flags & FLAG_AT) || !auth.credentialId || !auth.credentialPublicKey) throw new WebAuthnError('no credential')
    if (!bytesEqual(auth.credentialId, idBytes)) throw new WebAuthnError('credential id mismatch')
    if (deps.settings.userVerification === 'required' && !userVerified(auth.flags)) throw new WebAuthnError('user verification required')
    await importCoseKey(auth.credentialPublicKey)

    const credentialId = toBase64Url(idBytes)
    if (await deps.store.findByCredentialId(credentialId)) {
      await deps.audit('passkey.refused', 'register: credential already registered', user.id)
      return refuse(PASSKEY_REGISTER_REFUSED, 409)
    }

    const label = cleanLabel(body.label) || deviceLabelFromUserAgent(deps.userAgent ?? null)
    const id = await deps.store.insert({
      userId: user.id,
      credentialId,
      publicKey: toBase64Url(auth.credentialPublicKey),
      signCount: auth.signCount,
      transports: transportsFrom(body.response?.transports),
      deviceLabel: label || null,
      backedUp: (auth.flags & FLAG_BS) !== 0,
      createdAt: new Date(deps.now()).toISOString(),
    })
    await deps.audit('passkey.registered', label || 'passkey', user.id)
    return { ok: true, id }
  } catch (error) {
    await deps.audit('passkey.refused', `register: ${error instanceof Error ? error.message : 'invalid'}`, user.id)
    return refuse(PASSKEY_REGISTER_REFUSED, 400)
  }
}

// --- Sign-in ----------------------------------------------------------------

/** Request options for a discoverable sign-in: no account is named, the device offers the passkeys it holds. */
export async function loginOptions(deps: PasskeyDeps): Promise<ChallengeOutcome> {
  if (!featureReady(deps)) return refuse(PASSKEY_DISABLED_MESSAGE, 404)
  const { challenge, cookie } = await issueChallenge(deps.secret, 'login', null, deps.now())
  return {
    ok: true,
    cookie,
    options: {
      challenge,
      rpId: deps.rpId,
      timeout: TIMEOUT_MS,
      userVerification: deps.settings.userVerification,
      allowCredentials: [],
    },
  }
}

const sameBytesText = (value: string, expected: Uint8Array): boolean => {
  const bytes = fromBase64Url(value)
  return bytes !== null && bytesEqual(bytes, expected)
}

/** Checks a sign-in answer. Every refusal writes an audit line and returns the same message, so the reason is not revealed. */
export async function loginWithPasskey(
  deps: PasskeyDeps,
  body: LoginBody,
  cookie: string | null | undefined,
): Promise<PasskeyLoginResult> {
  const refusedFor = async (reason: string, userId?: number): Promise<PasskeyLoginResult> => {
    await deps.audit('passkey.refused', `sign-in: ${reason}`, userId)
    return { status: 'refused', message: PASSKEY_REFUSED_MESSAGE }
  }
  if (!featureReady(deps)) return { status: 'refused', message: PASSKEY_DISABLED_MESSAGE }

  const now = deps.now()
  const issued = await readChallenge(deps.secret, cookie, 'login', now)
  if (!issued) return refusedFor('no valid challenge')

  let row: PasskeyRow | null = null
  try {
    const idBytes = fromBase64Url(str(body.id))
    const rawBytes = fromBase64Url(str(body.rawId))
    const clientDataJSON = fromBase64Url(str(body.response?.clientDataJSON))
    const authenticatorData = fromBase64Url(str(body.response?.authenticatorData))
    const signature = fromBase64Url(str(body.response?.signature))
    if (!idBytes || !rawBytes || !bytesEqual(idBytes, rawBytes) || !clientDataJSON || !authenticatorData || !signature) {
      return refusedFor('malformed')
    }

    parseClientData(clientDataJSON, { type: 'webauthn.get', challenge: issued.challenge, origin: deps.origin })
    const auth = parseAuthData(authenticatorData)
    requireUserPresence(auth.flags)
    await checkRpId(auth.rpIdHash, deps.rpId)

    row = await deps.store.findByCredentialId(toBase64Url(idBytes))
    if (!row) return refusedFor('unknown credential')
    const userId = row.userId

    // A discoverable credential names its account in userHandle; it must be the one the row belongs to.
    const handle = str(body.response?.userHandle)
    if (handle && !sameBytesText(handle, utf8(String(userId)))) return refusedFor('user handle mismatch', userId)

    const user = await deps.findUser(userId)
    if (!user || !passkeyRoleAllowed(user, deps)) return refusedFor('account not eligible', userId)
    if (isLocked(user.lockUntil, now)) return refusedFor('account locked', userId)

    const uv = userVerified(auth.flags)
    if (deps.settings.userVerification === 'required' && !uv) return refusedFor('user verification required', userId)

    const cose = await importCoseKey(fromBase64Url(row.publicKey) ?? new Uint8Array())
    if (!(await verifyAssertionSignature(cose, signature, authenticatorData, clientDataJSON))) {
      return refusedFor('bad signature', userId)
    }

    // Sign counter: a counter that did not move forward means the key may have been copied.
    if (row.signCount !== 0 && auth.signCount !== 0 && auth.signCount <= row.signCount) {
      return refusedFor('counter regression (possible cloned key)', userId)
    }

    await deps.store.recordUse(row.id, auth.signCount, new Date(now).toISOString())
    const result = await deps.loginAsUser(userId, uv)
    if (result.twoFactorRequired && result.pendingToken) {
      await deps.audit('passkey.login', `${uv ? 'user verified' : 'user not verified'}: two-step code next`, userId)
      return { status: 'two-factor', pendingToken: result.pendingToken }
    }
    if (!result.token) return refusedFor('no session issued', userId)
    await deps.audit('passkey.login', uv ? 'user verified' : 'user not verified', userId)
    return { status: 'ok', token: result.token }
  } catch (error) {
    return refusedFor(error instanceof WebAuthnError ? error.message : 'lock or session error', row?.userId)
  }
}

// --- Managing passkeys ------------------------------------------------------

export type PasskeyView = {
  id: number
  deviceLabel: string
  createdAt: string
  lastUsedAt: string | null
  backedUp: boolean
}

export const viewOf = (row: PasskeyRow): PasskeyView => ({
  id: row.id,
  deviceLabel: row.deviceLabel || 'Passkey',
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
  backedUp: row.backedUp,
})

export async function listPasskeys(deps: PasskeyDeps, userId: number): Promise<PasskeyView[]> {
  return (await deps.store.listForUser(userId)).map(viewOf)
}

export async function renamePasskey(deps: PasskeyDeps, userId: number, id: number, label: unknown): Promise<{ ok: boolean; message?: string }> {
  const row = await deps.store.findForUser(userId, id)
  if (!row) return { ok: false, message: 'That passkey was not found.' }
  const clean = cleanLabel(label)
  if (!clean) return { ok: false, message: 'Give the passkey a name.' }
  await deps.store.rename(row.id, clean)
  return { ok: true }
}

/**
 * Removes one passkey. Refused when it is the last way in and the account has no password
 * and no other method: that would be a lockout, which passkeys must never cause.
 */
export async function removePasskey(
  deps: PasskeyDeps,
  userId: number,
  id: number,
  data: { password?: string; code?: string },
): Promise<{ ok: boolean; message?: string; status?: number }> {
  if (!(await deps.reauthenticate(userId, data))) return { ok: false, message: PASSKEY_REAUTH_MESSAGE, status: 403 }
  const row = await deps.store.findForUser(userId, id)
  if (!row) return { ok: false, message: 'That passkey was not found.', status: 404 }
  const remaining = (await deps.store.listForUser(userId)).length - 1
  if (remaining === 0 && !(await deps.hasOtherSignInMethod(userId))) {
    await deps.audit('passkey.refused', 'remove: last way in', userId)
    return { ok: false, message: PASSKEY_LAST_METHOD_MESSAGE, status: 409 }
  }
  await deps.store.remove(row.id)
  await deps.audit('passkey.removed', row.deviceLabel || 'passkey', userId)
  return { ok: true }
}

