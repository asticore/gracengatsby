import { resolveD1Binding } from '@/cms/db/connect'

import { USER_SESSIONS_TABLE, type UserSessionRow, type UserSessionStore } from './userSessions'

/**
 * The real `eg_user_sessions` table. Server-only (it reaches the database), so
 * nothing the request middleware loads may import it. Plain bound statements,
 * like the audit log, so a schema-generator quirk can never sit between a
 * sign-in and its session row.
 */

type Raw = {
  id: string
  user_id: number
  token_hash: string
  device_label: string | null
  ip: string | null
  created_at: string
  last_seen_at: string | null
  expires_at: string
  revoked_at: string | null
}

const toRow = (raw: Raw): UserSessionRow => ({
  id: raw.id,
  userId: Number(raw.user_id),
  tokenHash: raw.token_hash,
  deviceLabel: raw.device_label,
  ip: raw.ip,
  createdAt: raw.created_at,
  lastSeenAt: raw.last_seen_at,
  expiresAt: raw.expires_at,
  revokedAt: raw.revoked_at,
})

const T = `\`${USER_SESSIONS_TABLE}\``

export const defaultUserSessionStore: UserSessionStore = {
  async insert(row) {
    const d1 = await resolveD1Binding()
    await d1
      .prepare(
        `INSERT INTO ${T} (id, user_id, token_hash, device_label, ip, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.id, row.userId, row.tokenHash, row.deviceLabel, row.ip, row.createdAt, row.lastSeenAt, row.expiresAt, row.revokedAt)
      .run()
  },

  async findByID(id) {
    const d1 = await resolveD1Binding()
    const raw = await d1.prepare(`SELECT * FROM ${T} WHERE id = ? LIMIT 1`).bind(id).first<Raw>()
    return raw ? toRow(raw) : null
  },

  async listActiveForUser(userId, now) {
    const d1 = await resolveD1Binding()
    const result = await d1
      .prepare(`SELECT * FROM ${T} WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 100`)
      .bind(userId, now)
      .all<Raw>()
    return (result.results ?? []).map(toRow)
  },

  async touch(id, lastSeenAt) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET last_seen_at = ? WHERE id = ?`).bind(lastSeenAt, id).run()
  },

  async extend(id, expiresAt) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET expires_at = ? WHERE id = ? AND revoked_at IS NULL`).bind(expiresAt, id).run()
  },

  async revoke(id, userId, at) {
    const d1 = await resolveD1Binding()
    const result = await d1
      .prepare(`UPDATE ${T} SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
      .bind(at, id, userId)
      .run()
    return (result.meta?.changes ?? 0) > 0
  },

  async revokeForUser(userId, exceptId, at) {
    const d1 = await resolveD1Binding()
    const result = exceptId
      ? await d1
          .prepare(`UPDATE ${T} SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`)
          .bind(at, userId, exceptId)
          .run()
      : await d1.prepare(`UPDATE ${T} SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(at, userId).run()
    return result.meta?.changes ?? 0
  },
}
