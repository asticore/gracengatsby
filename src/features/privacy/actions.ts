'use server'

import { getAdminContext } from '@/admin/auth'
import { isOverdue, PRIVACY_STATUS_LABEL_KEYS, type PrivacyStatus } from './core'
import { auditPrivacy, gate } from './gate'
import { decideRequest, executeErasure } from './service'
import type { PrivacyRequest } from './store'

/**
 * What the admin privacy screen calls. Each action first runs the gate (signed in, the `privacy`
 * permission for read or update, not impersonating). Every decision and erasure is audited with the
 * request id and a status word, never the customer's details.
 */

export type PrivacyRequestView = {
  id: number
  email: string
  status: PrivacyStatus
  statusLabelKey: string
  createdAt: string
  dueAt: string
  overdue: boolean
  decidedAt: string | null
  completedAt: string | null
  result: Record<string, number> | null
}

export type PrivacyData = { requests: PrivacyRequestView[]; canEdit: boolean }

export type PrivacyActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string }

const toView = (r: PrivacyRequest, now: number): PrivacyRequestView => ({
  id: r.id,
  email: r.email,
  status: r.status,
  statusLabelKey: PRIVACY_STATUS_LABEL_KEYS[r.status],
  createdAt: r.createdAt,
  dueAt: r.dueAt,
  overdue: isOverdue(r, now),
  decidedAt: r.decidedAt,
  completedAt: r.completedAt,
  result: r.result,
})

export async function loadPrivacyAction(): Promise<PrivacyActionResult<PrivacyData>> {
  const g = await gate('read')
  if (g.ok === false) return { ok: false, error: g.error }
  const context = await getAdminContext()
  const canEdit = context.isAdmin || (await gate('update')).ok === true
  const now = Date.now()
  const rows = await g.store.list(200)
  return { ok: true, value: { requests: rows.map((r) => toView(r, now)), canEdit: Boolean(canEdit) } }
}

export async function approvePrivacyAction(id: number): Promise<PrivacyActionResult<PrivacyStatus>> {
  const g = await gate('update')
  if (g.ok === false) return { ok: false, error: g.error }
  const result = await decideRequest(g.store, Number(id), 'approve', g.userId, new Date())
  if (result.ok) await auditPrivacy(g, 'privacy.decide', Number(id), 'approved')
  return result
}

export async function rejectPrivacyAction(id: number): Promise<PrivacyActionResult<PrivacyStatus>> {
  const g = await gate('update')
  if (g.ok === false) return { ok: false, error: g.error }
  const result = await decideRequest(g.store, Number(id), 'reject', g.userId, new Date())
  if (result.ok) await auditPrivacy(g, 'privacy.decide', Number(id), 'rejected')
  return result
}

export async function erasePrivacyAction(id: number): Promise<PrivacyActionResult<{ emailed: boolean }>> {
  const g = await gate('update')
  if (g.ok === false) return { ok: false, error: g.error }
  const result = await executeErasure({ store: g.store, engine: g.engine, d1: g.d1, id: Number(id), actorId: g.userId, now: new Date() })
  if (result.ok === false) return result
  await auditPrivacy(g, 'privacy.erase', Number(id), `erased; confirmation email ${result.value?.emailed ? 'sent' : 'not sent'}`)
  return { ok: true, value: { emailed: Boolean(result.value?.emailed) } }
}
