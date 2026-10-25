import { resolveD1Binding } from '@/cms/db/connect'

import type { EmailOtpPurpose, EmailOtpRow, EmailOtpStore } from './twoFactorEmail'

/**
 * `eg_two_factor_email_codes`: plain bound statements, like the login-token and session tables.
 * Server-only: it reaches the database.
 */

type Raw = {
  id: number
  user_id: number
  purpose: string
  code_hash: string
  attempts: number
  created_at: string
  expires_at: string
  used_at: string | null
}

const T = '`eg_two_factor_email_codes`'

const toRow = (r: Raw): EmailOtpRow => ({
  id: Number(r.id),
  userId: Number(r.user_id),
  purpose: r.purpose as EmailOtpPurpose,
  codeHash: r.code_hash,
  attempts: Number(r.attempts ?? 0),
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  usedAt: r.used_at ?? null,
})

export const defaultEmailOtpStore: EmailOtpStore = {
  async insert(row) {
    const d1 = await resolveD1Binding()
    await d1
      .prepare(`INSERT INTO ${T} (user_id, purpose, code_hash, attempts, created_at, expires_at, used_at) VALUES (?, ?, ?, 0, ?, ?, NULL)`)
      .bind(row.userId, row.purpose, row.codeHash, row.createdAt, row.expiresAt)
      .run()
  },
  async invalidateOpen(userId, purpose, at) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL`).bind(at, userId, purpose).run()
  },
  async invalidateAll(userId, at) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET used_at = ? WHERE user_id = ? AND used_at IS NULL`).bind(at, userId).run()
  },
  async findLatestOpen(userId, purpose) {
    const d1 = await resolveD1Binding()
    const raw = await d1
      .prepare(`SELECT * FROM ${T} WHERE user_id = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`)
      .bind(userId, purpose)
      .first<Raw>()
    return raw ? toRow(raw) : null
  },
  async setAttempts(id, attempts) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET attempts = ? WHERE id = ?`).bind(attempts, id).run()
  },
  async consume(id, at) {
    const d1 = await resolveD1Binding()
    const result = await d1.prepare(`UPDATE ${T} SET used_at = ? WHERE id = ? AND used_at IS NULL`).bind(at, id).run()
    return (result.meta?.changes ?? 0) === 1
  },
}
