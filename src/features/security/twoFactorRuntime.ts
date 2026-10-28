import type { EmailOtpOps, TrustedDeviceOps } from '@/localapi/auth'

import * as rateLimit from './rateLimit'
import { readSecuritySettingsFromD1 } from './settings'
import { defaultEmailOtpStore } from './twoFactorEmailStore'
import { sendEmailOtp, verifyEmailOtp, type EmailOtpDeps } from './twoFactorEmail'
import { defaultTrustedDeviceStore } from './trustedDeviceStore'
import { checkTrustedDevice, issueTrustedDevice, revokeAllTrustedDevices } from './trustedDevices'

/**
 * Wires the email-code and trusted-device cores to the real tables, the mailer and the settings.
 * Server-only. The engine hands these to the sign-in code as `emailOtp` and `trustedDevices`.
 *
 * Every function here re-reads the settings (an isolate-cached single-row read), so switching a
 * feature off takes effect within a minute everywhere, including for codes and devices that
 * already exist: with the feature off, nothing is accepted.
 */

type SharedLimiter = (key: string, limit: number) => Promise<{ limited: boolean }>

/** The D1-backed limiter when this build has one (`hitShared`), the isolate-local one otherwise. */
export const emailOtpLimiter: SharedLimiter = async (key, limit) => {
  const shared = (rateLimit as unknown as { hitShared?: SharedLimiter }).hitShared
  return shared ? shared(key, limit) : rateLimit.hit(key, limit)
}

/** Sends the code through the Email feature. Loaded at call time: the Email feature reaches for the engine. */
export async function sendTwoFactorCodeEmail(to: string, code: string, minutes: number): Promise<unknown> {
  const { renderEmailTemplate } = await import('@/features/email/templateLoad')
  const { requestLocale } = await import('@/features/email/recipientLocale')
  const mail = await renderEmailTemplate('accountTwoFactorCode', { code, minutes: String(minutes) }, undefined, await requestLocale())
  const { sendEmail } = await import('@/features/email')
  return sendEmail({ to, template: 'account.two-factor-code', subject: mail.subject, text: mail.text, html: mail.html })
}

export const defaultEmailOtpDeps = (): EmailOtpDeps => ({
  store: defaultEmailOtpStore,
  mail: sendTwoFactorCodeEmail,
  limiter: emailOtpLimiter,
})

const emailAllowed = async (): Promise<boolean> => {
  const settings = await readSecuritySettingsFromD1()
  return settings.featureEnabled && settings.twoFactor.emailOtpEnabled
}

export const emailOtpOps: EmailOtpOps = {
  async verify(userId, code) {
    if (!(await emailAllowed())) return false
    return verifyEmailOtp(defaultEmailOtpDeps(), userId, code, 'login')
  },
  async send(user) {
    if (!(await emailAllowed())) return { ok: false, message: 'Email codes are not turned on for this site.' }
    return sendEmailOtp(defaultEmailOtpDeps(), { userId: user.id, email: user.email, purpose: 'login' })
  },
}

export const trustedDeviceOps: TrustedDeviceOps = {
  async check(token, userId, secret) {
    const settings = await readSecuritySettingsFromD1()
    if (!settings.featureEnabled || !settings.twoFactor.trustedDevicesEnabled) return false
    return checkTrustedDevice(defaultTrustedDeviceStore, { token, userId, secret })
  },
  async issue(userId, client, secret) {
    const settings = await readSecuritySettingsFromD1()
    if (!settings.featureEnabled || !settings.twoFactor.trustedDevicesEnabled) return null
    const issued = await issueTrustedDevice(defaultTrustedDeviceStore, { userId, days: settings.twoFactor.trustedDeviceDays, secret, client })
    return { token: issued.token, maxAgeSeconds: issued.maxAgeSeconds }
  },
  async revokeAll(userId) {
    await revokeAllTrustedDevices(defaultTrustedDeviceStore, userId)
  },
}
