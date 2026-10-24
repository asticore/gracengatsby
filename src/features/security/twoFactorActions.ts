'use server'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { headers } from 'next/headers'

import { getEngine } from '@/lib/engine'

import { audit, auditContext, type AuditAction } from './auditLog'
import { hit } from './rateLimit'
import { getSecuritySettings } from './settings'
import {
  backupCodesRemaining,
  confirmEnrolment,
  disableTwoFactor,
  isEnrolled,
  regenerateBackupCodes,
  resetTwoFactor,
  startEnrolment,
} from './twoFactor'
import { renderQrSvg } from './twoFactorQr'
import { defaultTwoFactorStore as store } from './twoFactorStore'

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
  if (!result.ok) return { ok: false, message: result.message }

  await record(engine, user, 'two-factor.enrolled')
  return { ok: true, backupCodes: result.backupCodes }
}

export async function disableTwoFactorAction(passwordOrCode: string): Promise<TwoFactorActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (limited(user.id)) return SLOW_DOWN

  const result = await disableTwoFactor(store, user, String(passwordOrCode ?? ''))
  if (!result.ok) return { ok: false, message: result.message }

  await record(engine, user, 'two-factor.disabled')
  return { ok: true, message: 'Two-step sign-in is off.' }
}

export async function regenerateBackupCodesAction(passwordOrCode: string): Promise<TwoFactorActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, user } = await currentUser()
  if (!user) return SIGNED_OUT
  if (limited(user.id)) return SLOW_DOWN

  const result = await regenerateBackupCodes(store, user, String(passwordOrCode ?? ''))
  if (!result.ok) return { ok: false, message: result.message }

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
  await record(engine, user, 'two-factor.reset', `account: ${target.email}`)
  return { ok: true, message: `Two-step sign-in was switched off for ${target.email}.` }
}
