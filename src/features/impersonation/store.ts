import { resolveD1Binding } from '@/cms/db/connect'

import type { ImpersonationRow, ImpersonationStore } from './service'

/**
 * The real `eg_impersonations` table. Server-only: it reaches the database, so
 * nothing the request middleware loads may import it. Bound statements only.
 */

const T = '`eg_impersonations`'

type Raw = {
  id: string
  admin_id: number
  admin_email: string
  target_user_id: number
  target_email: string
  reason: string
  started_at: string
  ended_at: string | null
  expires_at: string
  session_id: string | null
  ip: string | null
  user_agent: string | null
}

const toRow = (raw: Raw): ImpersonationRow => ({
  id: raw.id,
  adminId: Number(raw.admin_id),
  adminEmail: raw.admin_email,
  targetUserId: Number(raw.target_user_id),
  targetEmail: raw.target_email,
  reason: raw.reason,
  startedAt: raw.started_at,
  endedAt: raw.ended_at,
  expiresAt: raw.expires_at,
  sessionId: raw.session_id,
  ip: raw.ip,
  userAgent: raw.user_agent,
})

export const defaultImpersonationStore: ImpersonationStore = {
  async insert(row) {
    const d1 = await resolveD1Binding()
    await d1
      .prepare(
        `INSERT INTO ${T} (id, admin_id, admin_email, target_user_id, target_email, reason, started_at, ended_at, expires_at, ip, user_agent, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.adminId,
        row.adminEmail,
        row.targetUserId,
        row.targetEmail,
        row.reason,
        row.startedAt,
        row.endedAt,
        row.expiresAt,
        row.ip,
        row.userAgent,
        row.sessionId,
      )
      .run()
  },

  async findByID(id) {
    const d1 = await resolveD1Binding()
    const raw = await d1.prepare(`SELECT * FROM ${T} WHERE id = ? LIMIT 1`).bind(id).first<Raw>()
    return raw ? toRow(raw) : null
  },

  async setSession(id, sessionId) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET session_id = ? WHERE id = ?`).bind(sessionId, id).run()
  },

  async end(id, at) {
    const d1 = await resolveD1Binding()
    const result = await d1.prepare(`UPDATE ${T} SET ended_at = ? WHERE id = ? AND ended_at IS NULL`).bind(at, id).run()
    return (result.meta?.changes ?? 0) > 0
  },

  async list(limit) {
    const d1 = await resolveD1Binding()
    const result = await d1.prepare(`SELECT * FROM ${T} ORDER BY started_at DESC LIMIT ?`).bind(Math.max(1, Math.min(500, limit))).all<Raw>()
    return (result.results ?? []).map(toRow)
  },
}
