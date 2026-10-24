import type { SecuritySettings } from './settings'

/**
 * Two-factor sign-in for admins and customers: secret handling, TOTP and
 * backup-code verification, enrolment, and the enforcement point.
 *
 * STORAGE
 *
 * The state lives in flat columns on the users table (`twoFactorEnabled`,
 * `twoFactorSecret`, `twoFactorConfirmedAt`, `twoFactorLastUsedStep`, and
 * `twoFactorBackupHashes`, a JSON array of SHA-256 hex digests). They are
 * written only through a `TwoFactorStore`, never through a form field, so no
 * edit screen can read or overwrite them.
 *
 * This file is deliberately free of node-only imports (it uses Web Crypto
 * throughout) because the security feature's index is imported by the edge
 * middleware. The secret is encrypted at rest with the same `enc:v1:` format
 * and ENGAGE_SECRET-derived key `utilities/secretField.ts` uses, so the two
 * are interchangeable.
 *
 * SAFETY
 *
 * Nothing here changes behaviour for an account that has not completed
 * enrolment (`twoFactorEnabled` true AND `twoFactorConfirmedAt` set). A
 * half-finished enrolment never gates a sign-in. Backup codes are the way
 * back in when the authenticator is lost, and an administrator can reset an
 * account from the two-step screen.
 */

const DIGITS = 6
const PERIOD_SECONDS = 30
/** One step either side: enough for clock skew, small enough to stay useful. */
const DRIFT_STEPS = 1

export const BACKUP_CODE_COUNT = 10

// --- Row shapes and storage -------------------------------------------------

/** The columns this file reads. A real users auth row satisfies it as is. */
export type TwoFactorRow = {
  id: number
  email?: string
  roles?: string[] | null
  salt?: string | null
  hash?: string | null
  twoFactorEnabled?: boolean | null
  twoFactorSecret?: string | null
  twoFactorConfirmedAt?: string | null
  twoFactorLastUsedStep?: number | null
  twoFactorBackupHashes?: string | null
}

export type TwoFactorStore = {
  findByID: (id: number) => Promise<TwoFactorRow | null>
  updateByID: (id: number, data: Record<string, unknown>) => Promise<unknown>
  /** Checks a password against a row; needed only by disable/regenerate. */
  checkPassword?: (row: TwoFactorRow, password: string) => boolean
}

export type TwoFactorUser = {
  id?: number | string
  email?: string
  roles?: string[] | null
  twoFactorEnabled?: boolean | null
}

// --- Secret encryption (Web Crypto, same format as secretField.ts) ----------

const SECRET_PREFIX = 'enc:v1:'

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('Invalid hex.')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function aesKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(process.env.ENGAGE_SECRET || ''),
  )
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), new TextEncoder().encode(plain)),
  )
  // Web Crypto appends the 16 byte tag to the ciphertext; the stored format
  // keeps them apart, as secretField.ts does.
  const cipher = sealed.slice(0, sealed.length - 16)
  const tag = sealed.slice(sealed.length - 16)
  return `${SECRET_PREFIX}${toHex(iv)}:${toHex(tag)}:${toHex(cipher)}`
}

/** Returns '' when the value cannot be decrypted, e.g. after a key change. */
export async function decryptSecret(value: string | null | undefined): Promise<string> {
  if (typeof value !== 'string' || value.length === 0) return ''
  if (!value.startsWith(SECRET_PREFIX)) return value
  try {
    const [ivHex, tagHex, dataHex] = value.slice(SECRET_PREFIX.length).split(':')
    const joined = new Uint8Array([...fromHex(dataHex), ...fromHex(tagHex)])
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromHex(ivHex) as unknown as ArrayBuffer },
      await aesKey(),
      joined,
    )
    return new TextDecoder().decode(plain)
  } catch {
    return ''
  }
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}

// --- Base32, because authenticator apps speak it and nothing else -----------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]

  return output
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Invalid shared secret.')

    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Uint8Array.from(bytes)
}

// --- TOTP -------------------------------------------------------------------

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  // Counters exceed 32 bits only in the far future, but splitting the write
  // keeps it correct there too rather than silently truncating.
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)

  const key = await crypto.subtle.importKey(
    'raw',
    secret as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer))

  const offset = signature[signature.length - 1] & 0x0f
  const truncated =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)

  return String(truncated % 10 ** DIGITS).padStart(DIGITS, '0')
}

export type TotpResult = { valid: boolean; step: number | null }

/**
 * Checks a code and reports which time step matched.
 *
 * The caller must persist that step and refuse anything at or below it next
 * time. Without that, a code stays valid for its whole 30-second window and
 * anyone who watches it typed - over a shoulder, through a phishing page - can
 * replay it. That is why this returns the step rather than just a boolean.
 */
export async function verifyTotp(
  secretBase32: string,
  code: string,
  options: { now?: number; lastUsedStep?: number | null } = {},
): Promise<TotpResult> {
  const digits = code.replace(/\D/g, '')
  if (digits.length !== DIGITS) return { valid: false, step: null }

  let secret: Uint8Array
  try {
    secret = base32Decode(secretBase32)
  } catch {
    return { valid: false, step: null }
  }
  if (secret.length === 0) return { valid: false, step: null }

  const now = options.now ?? Date.now()
  const currentStep = Math.floor(now / 1000 / PERIOD_SECONDS)

  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset += 1) {
    const step = currentStep + offset
    if (step < 0) continue
    if (typeof options.lastUsedStep === 'number' && step <= options.lastUsedStep) continue

    const expected = await hotp(secret, step)
    if (timingSafeEqual(expected, digits)) return { valid: true, step }
  }

  return { valid: false, step: null }
}

/** Constant-time for equal-length strings, which is all this compares. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** A fresh 160-bit secret and the URI an authenticator app scans. */
export function enrolTwoFactor(accountLabel: string, issuer = 'Asticore Engage'): {
  secret: string
  otpauthUri: string
} {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const secret = base32Encode(bytes)

  const uri =
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_SECONDS}`

  return { secret, otpauthUri: uri }
}

// --- Backup codes -----------------------------------------------------------

/** No 0/o/1/i/l: codes get read off a screen and typed by hand. */
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Ten codes shaped xxxxx-xxxxx. Rejection sampling keeps every character equally likely. */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const limit = 256 - (256 % BACKUP_ALPHABET.length)
  const codes: string[] = []
  while (codes.length < count) {
    let raw = ''
    while (raw.length < 10) {
      for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
        if (byte < limit && raw.length < 10) raw += BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length]
      }
    }
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`
    if (!codes.includes(code)) codes.push(code)
  }
  return codes
}

export const normaliseBackupCode = (input: string): string =>
  input.toLowerCase().replace(/[^a-z0-9]/g, '')

const looksLikeBackupCode = (input: string): boolean => normaliseBackupCode(input).length === 10
const looksLikeTotp = (input: string): boolean => /^\d{6}$/.test(input.replace(/\s+/g, ''))

export const hashBackupCode = (input: string): Promise<string> => sha256Hex(normaliseBackupCode(input))

const parseHashes = (raw: string | null | undefined): string[] => {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const backupCodesRemaining = (row: Pick<TwoFactorRow, 'twoFactorBackupHashes'>): number =>
  parseHashes(row.twoFactorBackupHashes).length

async function newBackupSet(): Promise<{ codes: string[]; stored: string }> {
  const codes = generateBackupCodes()
  const hashes = await Promise.all(codes.map((code) => hashBackupCode(code)))
  return { codes, stored: JSON.stringify(hashes) }
}

// --- Enrolment state --------------------------------------------------------

/** Confirmed enrolment. A pending one (secret stored, not yet confirmed) is not. */
export const isEnrolled = (row: Pick<TwoFactorRow, 'twoFactorEnabled' | 'twoFactorConfirmedAt'> | null | undefined): boolean =>
  Boolean(row?.twoFactorEnabled && row?.twoFactorConfirmedAt)

/**
 * Whether a password-correct sign-in must be followed by a code.
 *
 * Also requires that SOMETHING can satisfy the check (a secret or at least one
 * unused backup code). A row flagged enabled with neither is a corrupted
 * enrolment, and gating it would lock the owner out with no way to answer.
 */
export const requiresSecondFactor = (row: TwoFactorRow | null | undefined): boolean =>
  isEnrolled(row) && (Boolean(row?.twoFactorSecret) || backupCodesRemaining(row) > 0)

export type TwoFactorResult = { ok: boolean; message?: string }

const NOT_SIGNED_IN = 'Sign in first.'

/**
 * Step one of enrolment: a fresh secret, stored encrypted and NOT yet active.
 * Sign-in is unaffected until `confirmEnrolment` succeeds. Calling it again
 * before confirming simply replaces the pending secret.
 */
export async function startEnrolment(
  store: TwoFactorStore,
  user: { id?: number | string; email?: string },
  issuer?: string,
): Promise<{ ok: boolean; message?: string; secret?: string; otpauthUri?: string }> {
  const id = Number(user?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: NOT_SIGNED_IN }

  const row = await store.findByID(id)
  if (!row) return { ok: false, message: NOT_SIGNED_IN }
  if (isEnrolled(row)) return { ok: false, message: 'Two-step sign-in is already switched on. Turn it off first to set it up again.' }

  const { secret, otpauthUri } = enrolTwoFactor(row.email || user.email || 'account', issuer)
  await store.updateByID(id, {
    twoFactorEnabled: false,
    twoFactorSecret: await encryptSecret(secret),
    twoFactorConfirmedAt: null,
    twoFactorLastUsedStep: null,
    twoFactorBackupHashes: null,
  })
  return { ok: true, secret, otpauthUri }
}

/**
 * Step two: the first code proves the app and the server agree on the time.
 * Only now does the account become gated. The one-time backup codes are
 * returned here and nowhere else - only their hashes are kept.
 */
export async function confirmEnrolment(
  store: TwoFactorStore,
  user: { id?: number | string },
  code: string,
  options: { now?: number } = {},
): Promise<{ ok: boolean; message?: string; backupCodes?: string[] }> {
  const id = Number(user?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: NOT_SIGNED_IN }

  const row = await store.findByID(id)
  if (!row) return { ok: false, message: NOT_SIGNED_IN }
  if (isEnrolled(row)) return { ok: false, message: 'Two-step sign-in is already switched on.' }

  const secret = await decryptSecret(row.twoFactorSecret)
  if (!secret) return { ok: false, message: 'Start setup first to get a key.' }

  const result = await verifyTotp(secret, code, { now: options.now })
  if (!result.valid) return { ok: false, message: 'That code did not match. Check the time on your phone and try the next code.' }

  const { codes, stored } = await newBackupSet()
  await store.updateByID(id, {
    twoFactorEnabled: true,
    twoFactorConfirmedAt: new Date(options.now ?? Date.now()).toISOString(),
    twoFactorLastUsedStep: result.step,
    twoFactorBackupHashes: stored,
  })
  return { ok: true, backupCodes: codes }
}

export type SecondFactorResult = {
  ok: boolean
  method?: 'totp' | 'backup'
  backupCodesLeft?: number
}

/**
 * Accepts a current authenticator code or an unused backup code.
 *
 * An authenticator code is refused if its time step was already used (replay).
 * A backup code is removed the moment it matches. The row is re-read here so
 * the check never runs against a stale copy.
 */
export async function verifySecondFactor(
  store: TwoFactorStore,
  user: { id?: number | string },
  code: string,
  options: { now?: number } = {},
): Promise<SecondFactorResult> {
  const id = Number(user?.id)
  if (!Number.isInteger(id) || id <= 0 || typeof code !== 'string') return { ok: false }

  const row = await store.findByID(id)
  if (!isEnrolled(row)) return { ok: false }

  if (looksLikeTotp(code)) {
    const secret = await decryptSecret(row.twoFactorSecret)
    if (!secret) return { ok: false }
    const result = await verifyTotp(secret, code, { now: options.now, lastUsedStep: row.twoFactorLastUsedStep })
    if (!result.valid) return { ok: false }
    await store.updateByID(id, { twoFactorLastUsedStep: result.step })
    return { ok: true, method: 'totp', backupCodesLeft: backupCodesRemaining(row) }
  }

  if (looksLikeBackupCode(code)) {
    const hashes = parseHashes(row.twoFactorBackupHashes)
    const candidate = await hashBackupCode(code)
    // Compared against every entry so timing does not reveal the position.
    let matched = -1
    hashes.forEach((hash, index) => {
      if (timingSafeEqual(hash, candidate)) matched = index
    })
    if (matched === -1) return { ok: false }

    const remaining = hashes.filter((_, index) => index !== matched)
    await store.updateByID(id, { twoFactorBackupHashes: JSON.stringify(remaining) })
    return { ok: true, method: 'backup', backupCodesLeft: remaining.length }
  }

  return { ok: false }
}

/** A code, or failing that the account password. */
async function proveIdentity(
  store: TwoFactorStore,
  row: TwoFactorRow,
  proof: string,
): Promise<boolean> {
  if (typeof proof !== 'string' || proof.length === 0) return false
  if ((looksLikeTotp(proof) || looksLikeBackupCode(proof)) && (await verifySecondFactor(store, row, proof)).ok) {
    return true
  }
  return Boolean(store.checkPassword && store.checkPassword(row, proof))
}

/** Switches two-step off and wipes the secret and codes. Needs a code or the password. */
export async function disableTwoFactor(
  store: TwoFactorStore,
  user: { id?: number | string },
  passwordOrCode: string,
): Promise<TwoFactorResult> {
  const id = Number(user?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: NOT_SIGNED_IN }

  const row = await store.findByID(id)
  if (!row) return { ok: false, message: NOT_SIGNED_IN }
  if (!row.twoFactorEnabled && !row.twoFactorSecret) return { ok: true }

  // Only a confirmed enrolment needs proof; a pending one gates nothing.
  if (isEnrolled(row) && !(await proveIdentity(store, row, passwordOrCode))) {
    return { ok: false, message: 'That password or code was not right.' }
  }

  await resetTwoFactor(store, id)
  return { ok: true }
}

/** Unconditional wipe. Callers are responsible for having checked who is asking. */
export async function resetTwoFactor(store: TwoFactorStore, id: number): Promise<void> {
  await store.updateByID(id, {
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorConfirmedAt: null,
    twoFactorLastUsedStep: null,
    twoFactorBackupHashes: null,
  })
}

/** Replaces all backup codes. The old set stops working. Returns the new set once. */
export async function regenerateBackupCodes(
  store: TwoFactorStore,
  user: { id?: number | string },
  passwordOrCode: string,
): Promise<{ ok: boolean; message?: string; backupCodes?: string[] }> {
  const id = Number(user?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: NOT_SIGNED_IN }

  const row = await store.findByID(id)
  if (!isEnrolled(row)) return { ok: false, message: 'Two-step sign-in is not switched on.' }
  if (!(await proveIdentity(store, row, passwordOrCode))) {
    return { ok: false, message: 'That password or code was not right.' }
  }

  const { codes, stored } = await newBackupSet()
  await store.updateByID(id, { twoFactorBackupHashes: stored })
  return { ok: true, backupCodes: codes }
}

// --- Enforcement point ------------------------------------------------------

export const ADMIN_ENROL_PATH = '/admin/security/two-factor'
export const MEMBER_ENROL_PATH = '/account/profile'

export type TwoFactorStatus = {
  /** A setting asks for two-step for this user. */
  required: boolean
  enrolled: boolean
  /** True when nothing is asked, or the ask is met. */
  satisfied: boolean
  /** True now that the setup screens exist. */
  enrolmentAvailable: boolean
  /** Required, not yet enrolled, and there is a screen to do it on: send them there. */
  mustEnrol: boolean
  /** Where `mustEnrol` sends the user. */
  enrolPath?: string
  reason?: string
}

const isAdminUser = (user: TwoFactorUser | null | undefined): boolean =>
  Boolean(user?.roles?.includes('admin'))

/** Customer accounts: staff roles other than admin are covered by neither setting. */
const isMemberUser = (user: TwoFactorUser | null | undefined): boolean =>
  Array.isArray(user?.roles) && user.roles.length > 0 && user.roles.every((role) => role === 'customer')

export function twoFactorStatus(
  user: TwoFactorUser | null | undefined,
  settings: SecuritySettings,
): TwoFactorStatus {
  const admin = isAdminUser(user)
  const member = !admin && isMemberUser(user)

  const required =
    Boolean(user) &&
    settings.featureEnabled &&
    ((admin && settings.loginProtection.requireTwoFactorForAdmins) ||
      (member && settings.loginProtection.requireTwoFactorForMembers))

  // `twoFactorEnabled` is only ever set by a confirmed enrolment.
  const enrolled = Boolean(user?.twoFactorEnabled)
  const enrolmentAvailable = true
  const mustEnrol = required && !enrolled && enrolmentAvailable

  return {
    required,
    enrolled,
    satisfied: !required || enrolled,
    enrolmentAvailable,
    mustEnrol,
    enrolPath: mustEnrol ? (admin ? ADMIN_ENROL_PATH : MEMBER_ENROL_PATH) : undefined,
    reason: mustEnrol ? 'Two-step sign-in is required for this account but has not been set up.' : undefined,
  }
}

/**
 * The single place that decides whether a signed-in user must be sent to set
 * up two-step. It never throws and never ends a session: an unenrolled user
 * whose account is covered by an enabled setting is redirected to the setup
 * screen (see `mustEnrol` / `enrolPath`), where setup and sign-out are the only
 * things they need. With both settings off (the default) `mustEnrol` is always
 * false and nothing changes for anyone.
 */
export function assertTwoFactorSatisfied(
  user: TwoFactorUser | null | undefined,
  settings: SecuritySettings,
): TwoFactorStatus {
  return twoFactorStatus(user, settings)
}
