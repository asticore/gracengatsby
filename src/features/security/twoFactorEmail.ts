import { MAX_CODE_ATTEMPTS, checkCode, codeHash, newCode } from '@/features/passwordless/tokens'

/**
 * A six-digit code emailed to the account address, as a second factor.
 *
 * The code is stored as `salt:sha256(salt:code)` (the same scheme as passwordless sign-in), lives
 * 10 minutes, dies after five wrong tries, and works once. A new request ends the previous
 * one. Sends are rate limited per account so the screen cannot be used to flood a mailbox.
 *
 * Pure: the store, the mailer, the limiter and the clock are passed in.
 */

export const EMAIL_OTP_TTL_MS = 10 * 60_000
export const EMAIL_OTP_MINUTES = 10
export const EMAIL_OTP_MAX_ATTEMPTS = MAX_CODE_ATTEMPTS
/** Sends allowed per account in one limiter window. */
export const EMAIL_OTP_SENDS_PER_WINDOW = 3

export type EmailOtpPurpose = 'login' | 'enrol'

export type EmailOtpRow = {
  id: number
  userId: number
  purpose: EmailOtpPurpose
  codeHash: string
  attempts: number
  createdAt: string
  expiresAt: string
  usedAt: string | null
}

export type EmailOtpStore = {
  insert(row: Omit<EmailOtpRow, 'id' | 'attempts' | 'usedAt'>): Promise<void>
  /** Marks every unused code of this purpose for the user as used. */
  invalidateOpen(userId: number, purpose: EmailOtpPurpose, at: string): Promise<void>
  findLatestOpen(userId: number, purpose: EmailOtpPurpose): Promise<EmailOtpRow | null>
  setAttempts(id: number, attempts: number): Promise<void>
  /** True only for the call that marked an unused row used: the single-use guard. */
  consume(id: number, at: string): Promise<boolean>
  /** Marks every unused code of the user as used, whatever its purpose. */
  invalidateAll?(userId: number, at: string): Promise<void>
}

export type EmailOtpDeps = {
  store: EmailOtpStore
  mail: (to: string, code: string, minutes: number) => Promise<unknown>
  limiter: (key: string, limit: number) => Promise<{ limited: boolean }>
  now?: () => number
}

export type EmailOtpSendResult = { ok: boolean; message: string }

export const EMAIL_OTP_SENT = 'We emailed you a six-digit code. It works once and lasts 10 minutes.'
export const EMAIL_OTP_SLOW_DOWN = 'A code was sent a moment ago. Check your email, or wait a minute and ask again.'
export const EMAIL_OTP_MAIL_FAILED = 'The email could not be sent. Try again, or use another way.'

export async function sendEmailOtp(
  deps: EmailOtpDeps,
  input: { userId: number; email: string; purpose: EmailOtpPurpose },
): Promise<EmailOtpSendResult> {
  if (!Number.isInteger(input.userId) || input.userId <= 0 || !input.email) return { ok: false, message: EMAIL_OTP_MAIL_FAILED }

  const decision = await deps.limiter(`two-factor-email:send:${input.userId}`, EMAIL_OTP_SENDS_PER_WINDOW)
  if (decision.limited) return { ok: false, message: EMAIL_OTP_SLOW_DOWN }

  const now = deps.now ? deps.now() : Date.now()
  const at = new Date(now).toISOString()
  const code = newCode()
  await deps.store.invalidateOpen(input.userId, input.purpose, at)
  await deps.store.insert({
    userId: input.userId,
    purpose: input.purpose,
    codeHash: await codeHash(code),
    createdAt: at,
    expiresAt: new Date(now + EMAIL_OTP_TTL_MS).toISOString(),
  })
  try {
    await deps.mail(input.email, code, EMAIL_OTP_MINUTES)
  } catch {
    // The code is useless if nobody got it: end it so a retry starts clean.
    await deps.store.invalidateOpen(input.userId, input.purpose, at).catch((): undefined => undefined)
    return { ok: false, message: EMAIL_OTP_MAIL_FAILED }
  }
  return { ok: true, message: EMAIL_OTP_SENT }
}

/** True when `code` is the live code for this user and purpose. Consumes it; wrong tries are counted. */
export async function verifyEmailOtp(
  deps: EmailOtpDeps,
  userId: number,
  code: string,
  purpose: EmailOtpPurpose,
): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0 || typeof code !== 'string') return false
  const digits = code.replace(/\s+/g, '')
  const now = deps.now ? deps.now() : Date.now()

  const row = await deps.store.findLatestOpen(userId, purpose)
  if (!row || row.usedAt || Date.parse(row.expiresAt) <= now || row.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    // Same work as a real check so a missing code does not answer faster.
    await checkCode('00:00', digits).catch((): boolean => false)
    return false
  }

  if (!/^\d{6}$/.test(digits) || !(await checkCode(row.codeHash, digits))) {
    const attempts = row.attempts + 1
    await deps.store.setAttempts(row.id, attempts)
    // The last allowed wrong try kills the code outright.
    if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) await deps.store.consume(row.id, new Date(now).toISOString())
    return false
  }
  return deps.store.consume(row.id, new Date(now).toISOString())
}
