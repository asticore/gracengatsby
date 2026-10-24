import { resolveD1Binding } from '@/cms/db/connect'

/**
 * `eg_login_tokens`: one row per emailed link or code. Plain bound statements,
 * like the social and session tables, so sign-in never depends on the schema
 * generator. The core takes a `LoginTokenStore` so tests can swap it.
 */

export type LoginKind = 'link' | 'code'

export type LoginTokenRow = {
  id: number
  userId: number
  kind: LoginKind
  tokenHash: string
  attempts: number
  createdAt: string
  expiresAt: string
  usedAt: string | null
}

export type NewLoginToken = Omit<LoginTokenRow, 'id' | 'attempts' | 'usedAt'>

export type LoginTokenStore = {
  insert(row: NewLoginToken): Promise<void>
  /** Marks every still-unused token for this user as used, so only the newest one works. */
  invalidateOpen(userId: number, at: string): Promise<void>
  /** The newest unused token of this kind for the user, used or not expired - the caller checks. */
  findLatestOpen(userId: number, kind: LoginKind): Promise<LoginTokenRow | null>
  findByHash(kind: LoginKind, tokenHash: string): Promise<LoginTokenRow | null>
  setAttempts(id: number, attempts: number): Promise<void>
  /** Marks the row used only if it was unused. True when this call did it: the single-use guard. */
  consume(id: number, at: string): Promise<boolean>
}

type Raw = {
  id: number
  user_id: number
  kind: string
  token_hash: string
  attempts: number
  created_at: string
  expires_at: string
  used_at: string | null
}

const TABLE = '`eg_login_tokens`'

const toRow = (r: Raw): LoginTokenRow => ({
  id: Number(r.id),
  userId: Number(r.user_id),
  kind: r.kind as LoginKind,
  tokenHash: r.token_hash,
  attempts: Number(r.attempts ?? 0),
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  usedAt: r.used_at ?? null,
})

export const defaultLoginTokenStore: LoginTokenStore = {
  async insert(row) {
    const d1 = await resolveD1Binding()
    await d1
      .prepare(
        `INSERT INTO ${TABLE} (user_id, kind, token_hash, attempts, created_at, expires_at, used_at) VALUES (?, ?, ?, 0, ?, ?, NULL)`,
      )
      .bind(row.userId, row.kind, row.tokenHash, row.createdAt, row.expiresAt)
      .run()
  },
  async invalidateOpen(userId, at) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${TABLE} SET used_at = ? WHERE user_id = ? AND used_at IS NULL`).bind(at, userId).run()
  },
  async findLatestOpen(userId, kind) {
    const d1 = await resolveD1Binding()
    const raw = await d1
      .prepare(`SELECT * FROM ${TABLE} WHERE user_id = ? AND kind = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`)
      .bind(userId, kind)
      .first<Raw>()
    return raw ? toRow(raw) : null
  },
  async findByHash(kind, tokenHash) {
    const d1 = await resolveD1Binding()
    const raw = await d1
      .prepare(`SELECT * FROM ${TABLE} WHERE kind = ? AND token_hash = ? ORDER BY id DESC LIMIT 1`)
      .bind(kind, tokenHash)
      .first<Raw>()
    return raw ? toRow(raw) : null
  },
  async setAttempts(id, attempts) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${TABLE} SET attempts = ? WHERE id = ?`).bind(attempts, id).run()
  },
  async consume(id, at) {
    const d1 = await resolveD1Binding()
    const result = await d1
      .prepare(`UPDATE ${TABLE} SET used_at = ? WHERE id = ? AND used_at IS NULL`)
      .bind(at, id)
      .run()
    return (result.meta?.changes ?? 0) === 1
  },
}
