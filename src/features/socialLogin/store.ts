import { resolveD1Binding } from '@/cms/db/connect'

import type { ProviderId } from './providers'

/**
 * Linked social identities: `eg_social_accounts`. Plain bound statements (like
 * the sessions and audit tables) so the sign-in path never depends on the
 * schema generator. The core takes a `SocialStore` so tests can swap it.
 */

export const SOCIAL_ACCOUNTS_TABLE = 'eg_social_accounts'

export type SocialAccountRow = {
  id: number
  userId: number
  provider: ProviderId
  providerUserId: string
  email: string | null
  createdAt: string
  lastLoginAt: string | null
}

export type SocialStore = {
  findByProviderUser(provider: ProviderId, providerUserId: string): Promise<SocialAccountRow | null>
  listForUser(userId: number): Promise<SocialAccountRow[]>
  /** Throws on a duplicate (provider, provider_user_id). */
  insert(row: Omit<SocialAccountRow, 'id'>): Promise<void>
  touchLogin(id: number, at: string, email: string | null): Promise<void>
  /** Removes one link, only if it belongs to `userId`. True when a row went. */
  remove(userId: number, provider: ProviderId): Promise<boolean>
}

type Raw = {
  id: number
  user_id: number
  provider: string
  provider_user_id: string
  email: string | null
  created_at: string
  last_login_at: string | null
}

const toRow = (r: Raw): SocialAccountRow => ({
  id: Number(r.id),
  userId: Number(r.user_id),
  provider: r.provider as ProviderId,
  providerUserId: r.provider_user_id,
  email: r.email,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
})

const T = `\`${SOCIAL_ACCOUNTS_TABLE}\``

export const defaultSocialStore: SocialStore = {
  async findByProviderUser(provider, providerUserId) {
    const d1 = await resolveD1Binding()
    const raw = await d1
      .prepare(`SELECT * FROM ${T} WHERE provider = ? AND provider_user_id = ? LIMIT 1`)
      .bind(provider, providerUserId)
      .first<Raw>()
    return raw ? toRow(raw) : null
  },
  async listForUser(userId) {
    const d1 = await resolveD1Binding()
    const result = await d1.prepare(`SELECT * FROM ${T} WHERE user_id = ? ORDER BY created_at ASC LIMIT 50`).bind(userId).all<Raw>()
    return (result.results ?? []).map(toRow)
  },
  async insert(row) {
    const d1 = await resolveD1Binding()
    await d1
      .prepare(`INSERT INTO ${T} (user_id, provider, provider_user_id, email, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(row.userId, row.provider, row.providerUserId, row.email, row.createdAt, row.lastLoginAt)
      .run()
  },
  async touchLogin(id, at, email) {
    const d1 = await resolveD1Binding()
    await d1.prepare(`UPDATE ${T} SET last_login_at = ?, email = COALESCE(?, email) WHERE id = ?`).bind(at, email, id).run()
  },
  async remove(userId, provider) {
    const d1 = await resolveD1Binding()
    const result = await d1.prepare(`DELETE FROM ${T} WHERE user_id = ? AND provider = ?`).bind(userId, provider).run()
    return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0
  },
}
