import type { D1Like } from '@/features/apiKeys'
import { dueDateFor, nextStatus, VERIFY_TTL_HOURS, type PrivacyAction, type PrivacyStatus } from './core'
import { hashVerifyToken, newVerifyToken } from './tokens'
import { eraseCustomerData, type EraseCounts } from './erase'
import type { PrivacyRequest, PrivacyStore } from './store'

/**
 * The privacy request rules that touch the store and the email. The screens and server actions
 * call these after their own session, permission and impersonation checks. Nothing here reads the
 * request's session.
 */

export type PrivacyResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string; code?: 'invalid' | 'expired' | 'state' | 'open' }

/** The email feature is loaded at call time, as the account emails do, so this module loads without the engine. */
const sendMail = async (to: string, subject: string, text: string): Promise<boolean> => {
  try {
    const { sendEmail } = await import('@/features/email')
    const result = await sendEmail({ to, template: 'privacy.notice', subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` })
    return Boolean((result as { ok?: boolean }).ok ?? true)
  } catch {
    return false
  }
}

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string)

/**
 * Opens a deletion request for the signed-in customer and emails the confirmation link. Only one
 * open request per customer. The request waits as `unverified` until the link is opened.
 */
export async function openDeletionRequest(args: {
  store: PrivacyStore
  userId: number
  email: string
  siteOrigin: string
  now: Date
}): Promise<PrivacyResult<{ id: number }>> {
  const existing = await args.store.openForUser(args.userId)
  if (existing) return { ok: false, error: 'You already have a deletion request open. We will email you when it is complete.', code: 'open' }
  const at = args.now.toISOString()
  const { token, hash } = newVerifyToken()
  const expires = new Date(args.now.getTime() + VERIFY_TTL_HOURS * 60 * 60 * 1000).toISOString()
  const id = await args.store.insert(
    { userId: args.userId, email: args.email, status: 'unverified', dueAt: dueDateFor(at), verifyHash: hash, verifyExpiresAt: expires },
    at,
  )
  const link = `${args.siteOrigin}/account/privacy/confirm?token=${encodeURIComponent(token)}`
  await sendMail(
    args.email,
    'Confirm your deletion request',
    `We received a request to delete your account and personal data.\n\nTo confirm, open this link within ${VERIFY_TTL_HOURS} hours:\n${link}\n\nIf you did not ask for this, ignore this email. Nothing is deleted until the request is confirmed and reviewed.`,
  )
  return { ok: true, value: { id } }
}

/** Opens the emailed link. Moves the request from unverified to new so an admin can review it. */
export async function confirmDeletionByToken(store: PrivacyStore, token: string, now: Date): Promise<PrivacyResult<{ id: number }>> {
  if (!token || token.length > 200) return { ok: false, error: 'This link is not valid.', code: 'invalid' }
  const row = await store.findByVerifyHash(hashVerifyToken(token))
  if (!row) return { ok: false, error: 'This link is not valid, or it was already used.', code: 'invalid' }
  if (!row.verifyExpiresAt || new Date(row.verifyExpiresAt).getTime() < now.getTime()) {
    await store.update(row.id, { status: 'rejected', decidedAt: now.toISOString(), decidedBy: null }, now.toISOString())
    return { ok: false, error: 'This link has expired. Start the request again from your account.', code: 'expired' }
  }
  const to = nextStatus(row.status, 'verify')
  if (!to) return { ok: false, error: 'This request is no longer waiting for confirmation.', code: 'state' }
  const at = now.toISOString()
  await store.update(row.id, { status: to, verifiedAt: at, verifyHash: null, verifyExpiresAt: null }, at)
  return { ok: true, value: { id: row.id } }
}

/** Applies an approve or reject decision. Returns the new status, or an error when the move is not allowed. */
export async function decideRequest(
  store: PrivacyStore,
  id: number,
  action: Exclude<PrivacyAction, 'verify' | 'erase'>,
  actorId: number,
  now: Date,
): Promise<PrivacyResult<PrivacyStatus>> {
  const row = await store.findById(id)
  if (!row) return { ok: false, error: 'That request no longer exists.' }
  const to = nextStatus(row.status, action)
  if (!to) return { ok: false, error: `This request cannot be ${action === 'approve' ? 'approved' : 'rejected'} from its current status.` }
  const at = now.toISOString()
  await store.update(row.id, { status: to, decidedAt: at, decidedBy: actorId, verifyHash: null, verifyExpiresAt: null }, at)
  return { ok: true, value: to }
}

/**
 * Carries out an approved erasure: the records and then the account, then the confirmation email.
 * The email is sent before the customer record goes, while the address is still known.
 */
export async function executeErasure(args: {
  store: PrivacyStore
  engine: unknown
  d1: D1Like
  id: number
  actorId: number
  now: Date
}): Promise<PrivacyResult<{ counts: EraseCounts; emailed: boolean }>> {
  const row: PrivacyRequest | null = await args.store.findById(args.id)
  if (!row) return { ok: false, error: 'That request no longer exists.' }
  const to = nextStatus(row.status, 'erase')
  if (!to) return { ok: false, error: 'Approve the request before erasing the data.' }
  if (row.userId === null) return { ok: false, error: 'This request has no customer account to erase.' }
  const counts = await eraseCustomerData(args.engine, args.d1, row.userId, row.email)
  // The confirmation goes first, while the address is still on the request.
  const emailed = await sendMail(
    row.email,
    'Your personal data has been deleted',
    'We have deleted your account and the personal data we held about you, as you asked.\n\nOrder totals and tax records are kept without your name, email or address, because the law requires us to keep them.\n\nIf you have questions, reply to this email or contact the site owner.',
  )
  // The request keeps only counts and dates. The address and the account link go.
  const at = args.now.toISOString()
  await args.store.update(row.id, { status: to, completedAt: at, decidedAt: at, decidedBy: args.actorId, result: counts, email: 'erased', userId: null }, at)
  return { ok: true, value: { counts, emailed } }
}
