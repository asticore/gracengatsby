import { resolveD1Binding } from '@/cms/db/connect'

import type { TrustedDeviceRow, TrustedDeviceStore } from './trustedDevices'

/** `eg_trusted_devices`: plain bound statements. Server-only: it reaches the database. */

type Raw = {
  id: string
  user_id: number
  token_hash: string
  label: string | null
  ip: string | null
  created_at: string
  last_used_at: string | null
  expires_at: string
  revoked_at: string | null
}

const T = '`eg_trusted_devices`'

const toRow = (r: Raw): TrustedDeviceRow => ({
  id: r.id,
  userId: Number(r.user_id),
  tokenHash: r.token_hash,
  label: r.label,
  ip: r.ip,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
})

export const defaultTrustedDeviceStore: TrustedDeviceStore = {
  async insert(row) {
    const d1 = await resolveD1Binding()
    await d1
      .prepare(`INSERT INTO ${T} (id, user_id, token_hash, label, ip, created_at, last_used_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
      .bind(row.id, row.userId, row.tokenHash, row.label, row.ip, row.createdAt, row.lastUsedAt, row.expiresAt)
      .run()
  },
  async findByID(id) {
    const d1 = await resolveD1Binding()
    const raw = await d1.prepare(`SELECT * FROM ${T} WHERE id = ? LIMIT 1`).bind(id).first<Raw>()
    return raw ? toRow(raw) : null
  },
  async listActiveForUser(userId, nowIso) {
    const d1 = await resolveD1Binding()
    const result = await d1
      .prepare(`SELECT * FROM ${T} WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 100`)
      .bind(userId, nowIso)
      .all<Raw>()
    return (result.results ?? []).map(toRow)
  },
  async touch(id, at) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET last_used_at = ? WHERE id = ?`).bind(at, id).run()
  },
  async revoke(id, userId, at) {
    const d1 = await resolveD1Binding()
    const result = await d1.prepare(`UPDATE ${T} SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).bind(at, id, userId).run()
    return (result.meta?.changes ?? 0) > 0
  },
  async revokeForUser(userId, at) {
    const d1 = await resolveD1Binding()
    const result = await d1.prepare(`UPDATE ${T} SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(at, userId).run()
    return result.meta?.changes ?? 0
  },
}
