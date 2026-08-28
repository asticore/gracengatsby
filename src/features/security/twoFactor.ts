import type { Field } from 'payload'

import { decryptSecretHook, encryptSecretHook } from '@/utilities/secretField'

import type { SecuritySettings } from './settings'

/**
 * Two-factor sign-in for admins: storage, verification and the enforcement
 * point.
 *
 * WHAT IS HERE AND WHAT IS NOT
 *
 * Here: the fields the shared secret lives in (encrypted at rest, reusing the
 * same field hooks the API-key fields use), a real RFC 6238 TOTP verifier with
 * the usual one-step drift window, replay rejection, and the check that
 * decides whether a given admin may proceed.
 *
 * NOT here, and deliberately not faked: the enrolment screen. Turning this on
 * for an account needs a page that generates a secret, renders the otpauth://
 * QR code, takes a first code to confirm the clocks agree, and shows one-time
 * recovery codes. Until that exists, `enrolTwoFactor()` is the only way to set
 * a secret and it has to be called from a script. `twoFactorStatus()` reports
 * `enrolmentAvailable: false` so nothing above it can mistake the missing
 * screen for a configured one, and the enforcement below refuses to lock out
 * an admin who has no way to enrol - see `assertTwoFactorSatisfied`.
 */

const DIGITS = 6
const PERIOD_SECONDS = 30
/** One step either side: enough for clock skew, small enough to stay useful. */
const DRIFT_STEPS = 1

// --- Storage ----------------------------------------------------------------

/**
 * Spread into the admin user collection's `fields`.
 *
 * The secret is `hidden` rather than access-controlled alone: it must never be
 * rendered into the edit form at all, because a field an admin can read is a
 * field an admin's compromised browser can read.
 */
export const twoFactorFields: Field[] = [
  {
    type: 'group',
    name: 'twoFactor',
    label: 'Two-step sign-in',
    admin: {
      description: 'Confirms a sign-in with a code from an authenticator app.',
    },
    fields: [
      {
        name: 'enabled',
        type: 'checkbox',
        defaultValue: false,
        admin: {
          readOnly: true,
          description: 'Switched on by completing setup, not by ticking this.',
        },
      },
      {
        name: 'secret',
        type: 'text',
        hidden: true,
        access: {
          read: () => false,
          update: () => false,
          create: () => false,
        },
        hooks: {
          beforeChange: [encryptSecretHook],
          afterRead: [decryptSecretHook],
        },
      },
      {
        name: 'confirmedAt',
        type: 'date',
        admin: { readOnly: true, description: 'When setup was completed.' },
      },
      {
        name: 'lastUsedStep',
        type: 'number',
        hidden: true,
        admin: { readOnly: true },
      },
    ],
  },
]

export type TwoFactorRecord = {
  enabled?: boolean | null
  secret?: string | null
  confirmedAt?: string | null
  lastUsedStep?: number | null
}

export type TwoFactorUser = {
  id?: number | string
  email?: string
  roles?: string[] | null
  twoFactor?: TwoFactorRecord | null
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

// --- Enforcement point ------------------------------------------------------

export type TwoFactorStatus = {
  required: boolean
  enrolled: boolean
  satisfied: boolean
  /** False until the enrolment screen exists. See the header of this file. */
  enrolmentAvailable: boolean
  reason?: string
}

const isAdminUser = (user: TwoFactorUser | null | undefined): boolean =>
  Boolean(user?.roles?.includes('admin'))

export function twoFactorStatus(
  user: TwoFactorUser | null | undefined,
  settings: SecuritySettings,
): TwoFactorStatus {
  const required =
    settings.featureEnabled && settings.loginProtection.requireTwoFactorForAdmins && isAdminUser(user)

  const enrolled = Boolean(user?.twoFactor?.enabled && user?.twoFactor?.confirmedAt)

  return {
    required,
    enrolled,
    satisfied: !required || enrolled,
    enrolmentAvailable: false,
    reason: required && !enrolled ? 'Two-step sign-in is required for admins but has not been set up.' : undefined,
  }
}

/**
 * The single place that decides whether a sign-in may proceed. Wire it as an
 * `afterLogin` hook on the admin user collection.
 *
 * It refuses to throw while enrolment is unavailable, and that is the whole
 * point of `enrolmentAvailable`: with no screen to set a secret on, enforcing
 * the requirement would lock every admin out of the portal permanently, with
 * no route back in short of a database edit. So it returns the status and lets
 * the caller surface the warning. The moment the enrolment screen lands, flip
 * `enrolmentAvailable` to true and change the marked line below to throw - it
 * is one line, and it is the only line.
 */
export function assertTwoFactorSatisfied(
  user: TwoFactorUser | null | undefined,
  settings: SecuritySettings,
): TwoFactorStatus {
  const status = twoFactorStatus(user, settings)

  if (!status.satisfied && status.enrolmentAvailable) {
    // <- the one line: becomes `throw new Error(status.reason)` on that day.
    return status
  }

  return status
}
