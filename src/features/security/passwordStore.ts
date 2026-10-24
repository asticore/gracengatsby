import { resolveD1Binding } from '@/cms/db/connect'

import { parseHistory, pushHistory, serializeHistory, type PasswordHistoryEntry } from './passwordPolicy'

/**
 * The two per-account password columns the policy needs, read and written with
 * bound statements (like userSessionStore.ts), so a schema-generator quirk never
 * sits between a password change and its history. Server-only.
 *
 * `password_changed_at` is when the password was last set. `password_history_hashes`
 * is a JSON list of the most recent salted hashes, newest first.
 */

export type PasswordState = {
  id: number
  email: string
  createdAt: string | null
  passwordChangedAt: string | null
  history: PasswordHistoryEntry[]
}

const USERS = '`eg_users`'

type Raw = {
  id: number
  email: string
  created_at: string | null
  password_changed_at: string | null
  password_history_hashes: string | null
}

const toState = (raw: Raw): PasswordState => ({
  id: Number(raw.id),
  email: String(raw.email ?? ''),
  createdAt: raw.created_at ?? null,
  passwordChangedAt: raw.password_changed_at ?? null,
  history: parseHistory(raw.password_history_hashes),
})

const SELECT = 'SELECT id, email, created_at, password_changed_at, password_history_hashes FROM ' + USERS

export async function readPasswordStateById(id: number): Promise<PasswordState | null> {
  const d1 = await resolveD1Binding()
  const row = await d1.prepare(`${SELECT} WHERE id = ?`).bind(id).first<Raw>()
  return row ? toState(row) : null
}

/** The account a reset link belongs to, found by its token. Null for an unknown token. */
export async function readPasswordStateByResetToken(token: string): Promise<PasswordState | null> {
  if (!token) return null
  const d1 = await resolveD1Binding()
  const row = await d1.prepare(`${SELECT} WHERE reset_password_token = ?`).bind(token).first<Raw>()
  return row ? toState(row) : null
}

/**
 * Records that a password was just set: stamps the time and pushes its hash onto
 * the history. Called after every password write, so the history is complete from
 * the moment this version of the site is live.
 */
export async function recordPasswordSet(id: number, password: string, now: Date = new Date()): Promise<void> {
  const d1 = await resolveD1Binding()
  const current = await readPasswordStateById(id)
  const entries = pushHistory(current?.history ?? [], password)
  await d1
    .prepare(`UPDATE ${USERS} SET password_changed_at = ?, password_history_hashes = ? WHERE id = ?`)
    .bind(now.toISOString(), serializeHistory(entries), id)
    .run()
}
