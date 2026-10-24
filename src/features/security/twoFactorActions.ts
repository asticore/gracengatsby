'use server'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { headers } from 'next/headers'

import { getEngine } from '@/lib/engine'

import { audit, auditContext, type AuditAction } from './auditLog'
import { clientKey, hit } from './rateLimit'
import { getSecuritySettings } from './settings'
import {
  backupCodesRemaining,
  confirmEmailEnrolment,
  confirmEnrolment,
  disableTwoFactor,
  isEnrolled,
  regenerateBackupCodes,
  resetTwoFactor,
  startEnrolment,
} from './twoFactor'
import { renderQrSvg } from './twoFactorQr'
import { defaultTwoFactorStore as store } from './twoFactorStore'
import { sendEmailOtp, verifyEmailOtp } from './twoFactorEmail'
import { defaultEmailOtpDeps } from './twoFactorRuntime'
import { defaultTrustedDeviceStore } from './trustedDeviceStore'
import { listTrustedDevices, revokeAllTrustedDevices, revokeTrustedDevice, type TrustedDeviceView } from './trustedDevices'

/**
 * What the two-step screens (admin and customer) call.
 *
 * The user is always the session's, never an argument. Every action that takes
 * a code or password shares one small per-user budget, so the screens cannot
 * be used to guess a code faster than the sign-in form allows.
 */

export type TwoFactorActionResult = {
  ok: boolean
  message?: string
  /** Base32 key for typing into an app by hand. */
  secret?: string
  /** Inline SVG markup of the QR code. Generated here, from our own encoder. */
  qrSvg?: string
  backupCodes?: string[]
}

export type TwoFactorPanelOptions = {
  /** An emailed code may be used to set up and to answer the second step. */
  emailEnabled: boolean
  /** The site lets a device be remembered. */
  trustedDevicesEnabled: boolean
  trustedDevices: TrustedDeviceView[]
}

export type TwoFactorChallengeOptions = { emailAvailable: boolean; trustAvailable: boolean; trustDays: number }

export type TwoFactorSummary = {
  signedIn: boolean
  enrolled: boolean
  backupCodesLeft: number
  isAdmin: boolean
}

const GUESSES_PER_MINUTE = 10

async function currentUser() {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: await headers() }).catch((): { user: null } => ({ user: null }))
  return { engine, user: (user as { id: number; email: string; roles?: string[] } | null) ?? null }
}

async function record(engine: Awaited<ReturnType<typeof getEngine>>, user: { id: number; email: string }, action: AuditAction, detail?: string) {
  try {
    const settings = await getSecuritySettings(engine as never)
    const context = auditContext(new Request('https://engage.local', { headers: await headers() }))
    await audit({ action, actorId: user.id, actorEmail: user.email, collectionSlug: 'users', detail: detail ?? null, ...context }, settings)
  } catch {
    // Never fail the action over a log line.
  }
}

const limited = (userId: number): boolean => hit(`two-factor:manage:${userId}`, GUESSES_PER_MINUTE).limited

const SIGNED_OUT: TwoFactorActionResult = { ok: false, message: 'Your session has ended. Sign in and try again.' }
const SLOW_DOWN: TwoFactorActionResult = { ok: false, message: 'Too many attempts. Wait a minute and try again.' }

export async function twoFactorSummaryAction(): Promise<TwoFactorSummary> {
  const { user } = await currentUser()
  if (!user) return { signedIn: false, enrolled: false, backupCodesLeft: 0, isAdmin: false }
  const row = await store.findByID(user.id)
  return {
    signedIn: true,
    enrolled: isEnrolled(row),
    backupCodesLeft: row ? backupCodesRemaining(row) : 0,
    isAdmin: Boolean(user.roles?.includes('admin')),
  }
}

export async function beginTwoFactorAction(): Promise<TwoFactorActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { user } = await currentUser()
  if (!user) return SIGNED_OUT

  const result = await startEnrolment(store, user)
  if (!result.ok || !result.otpauthUri) return { ok: false, message: result.message }
  return { ok: true, secret: result.secret, qrSvg: renderQrSvg(result.otpauthUri) }
}

export async function confirmTwoFactorAction(code: string): Promise<TwoFactorActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (limited(user.id)) return SLOW_DOWN

  const result = await confirmEnrolment(store, user, String(code ?? ''))
  if (!result.ok) {
    await record(engine, user, 'two-factor.failed', 'enrolment code')
    return { ok: false, message: result.message }
  }

  await record(engine, user, 'two-factor.enrolled')
  return { ok: true, backupCodes: result.backupCodes }
}

export async function disableTwoFactorAction(passwordOrCode: string): Promise<TwoFactorActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (limited(user.id)) return SLOW_DOWN

  const result = await disableTwoFactor(store, user, String(passwordOrCode ?? ''))
  if (!result.ok) {
    await record(engine, user, 'two-factor.failed', 'disable')
    return { ok: false, message: result.message }
  }

  await revokeAllTrustedDevices(defaultTrustedDeviceStore, user.id)
  await record(engine, user, 'two-factor.disabled')
  return { ok: true, message: 'Two-step sign-in is off.' }
}

export async function regenerateBackupCodesAction(passwordOrCode: string): Promise<TwoFactorActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (limited(user.id)) return SLOW_DOWN

  const result = await regenerateBackupCodes(store, user, String(passwordOrCode ?? ''))
  if (!result.ok) {
    await record(engine, user, 'two-factor.failed', 'backup codes')
    return { ok: false, message: result.message }
  }

  await record(engine, user, 'two-factor.backup-codes')
  return { ok: true, backupCodes: result.backupCodes }
}

/**
 * Recovery for someone who has lost both their authenticator and their backup
 * codes: an administrator switches two-step off on their account. They then
 * sign in with a password alone and can set it up again. Admin sessions only.
 */
export async function adminResetTwoFactorAction(email: string): Promise<TwoFactorActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (!user.roles?.includes('admin')) return { ok: false, message: 'Only an administrator can do that.' }

  const address = String(email ?? '').trim().toLowerCase()
  if (!address) return { ok: false, message: 'Enter the email address of the account.' }

  const found = await engine.find({ collection: 'users', where: { email: { equals: address } }, limit: 1, depth: 0, overrideAccess: true })
  const target = found.docs[0] as { id: number; email: string } | undefined
  if (!target) return { ok: false, message: 'No account has that email address.' }

  await resetTwoFactor(store, target.id)
  await revokeAllTrustedDevices(defaultTrustedDeviceStore, target.id)
  await record(engine, user, 'two-factor.reset', `account: ${target.email}`)
  return { ok: true, message: `Two-step sign-in was switched off for ${target.email}.` }
}

// --- Email codes and trusted devices ---------------------------------------

const emailEnabledFor = async (engine: Awaited<ReturnType<typeof getEngine>>): Promise<boolean> => {
  const settings = await getSecuritySettings(engine as never)
  return settings.featureEnabled && settings.twoFactor.emailOtpEnabled
}

/** What the setup panel may offer, and the signed-in person's remembered devices. */
export async function twoFactorPanelOptionsAction(): Promise<TwoFactorPanelOptions> {
  const { engine, user } = await currentUser()
  if (!user) return { emailEnabled: false, trustedDevicesEnabled: false, trustedDevices: [] }
  const settings = await getSecuritySettings(engine as never)
  const on = settings.featureEnabled
  return {
    emailEnabled: on && settings.twoFactor.emailOtpEnabled,
    trustedDevicesEnabled: on && settings.twoFactor.trustedDevicesEnabled,
    trustedDevices: await listTrustedDevices(defaultTrustedDeviceStore, user.id).catch((): TrustedDeviceView[] => []),
  }
}

/** What the sign-in second-step screen may offer. Needs no session: it only reports two site settings. */
export async function twoFactorChallengeOptionsAction(): Promise<TwoFactorChallengeOptions> {
  try {
    const engine = await getEngine()
    const settings = await getSecuritySettings(engine as never)
    const on = settings.featureEnabled
    return { emailAvailable: on && settings.twoFactor.emailOtpEnabled, trustAvailable: on && settings.twoFactor.trustedDevicesEnabled, trustDays: settings.twoFactor.trustedDeviceDays }
  } catch {
    return { emailAvailable: false, trustAvailable: false, trustDays: 30 }
  }
}

/** Emails the second-step code for a pending sign-in. Rate limited per address and per account. */
export async function sendChallengeEmailAction(pendingToken: string): Promise<TwoFactorActionResult> {
  const decision = hit(`two-factor-email:${clientKey(new Request('https://engage.local', { headers: await headers() }))}`, 5)
  if (decision.limited) return SLOW_DOWN
  try {
    const engine = await getEngine()
    const result = await engine.sendSecondFactorEmail({ collection: 'users', data: { pendingToken: String(pendingToken ?? '') } })
    return { ok: result.ok, message: result.message }
  } catch {
    return { ok: false, message: 'That sign-in took too long. Start again.' }
  }
}

/** Step one of email enrolment: emails a code to the signed-in account's own address. */
export async function beginEmailTwoFactorAction(): Promise<TwoFactorActionResult> {
  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (!(await emailEnabledFor(engine))) return { ok: false, message: 'Email codes are not turned on for this site.' }

  const row = await store.findByID(user.id)
  if (isEnrolled(row)) return { ok: false, message: 'Two-step sign-in is already switched on.' }
  const sent = await sendEmailOtp(defaultEmailOtpDeps(), { userId: user.id, email: user.email, purpose: 'enrol' })
  return { ok: sent.ok, message: sent.message }
}

/** Step two of email enrolment: the code switches two-step on and returns the backup codes once. */
export async function confirmEmailTwoFactorAction(code: string): Promise<TwoFactorActionResult> {
  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (limited(user.id)) return SLOW_DOWN
  if (!(await emailEnabledFor(engine))) return { ok: false, message: 'Email codes are not turned on for this site.' }

  const result = await confirmEmailEnrolment(store, user, (id) => verifyEmailOtp(defaultEmailOtpDeps(), id, String(code ?? ''), 'enrol'))
  if (!result.ok) {
    await record(engine, user, 'two-factor.failed', 'email enrolment code')
    return { ok: false, message: result.message }
  }
  await record(engine, user, 'two-factor.enrolled', 'email')
  return { ok: true, backupCodes: result.backupCodes }
}

export async function revokeTrustedDeviceAction(id: string): Promise<TwoFactorActionResult & { devices?: TrustedDeviceView[] }> {
  const { user } = await currentUser()
  if (!user) return SIGNED_OUT
  const done = await revokeTrustedDevice(defaultTrustedDeviceStore, user.id, String(id ?? ''))
  if (!done) return { ok: false, message: 'That device is already forgotten or could not be found.' }
  return { ok: true, message: 'That device will ask for a code next time.', devices: await listTrustedDevices(defaultTrustedDeviceStore, user.id) }
}

export async function revokeAllTrustedDevicesAction(): Promise<TwoFactorActionResult & { devices?: TrustedDeviceView[] }> {
  const { user } = await currentUser()
  if (!user) return SIGNED_OUT
  const count = await revokeAllTrustedDevices(defaultTrustedDeviceStore, user.id)
  return { ok: true, message: count === 0 ? 'No devices were remembered.' : `Forgot ${count} device${count === 1 ? '' : 's'}.`, devices: [] }
}
