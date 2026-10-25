import { resolveD1Binding } from '@/cms/db/connect'

/**
 * Email verification tokens, one row per email sent (`eg_email_verifications`),
 * read and written with bound statements. Only the SHA-256 of a token is stored;
 * the token itself lives in the email. A row can be used once (`used_at`) and
 * only before `expires_at`. Server-only.
 */

const TABLE = '`eg_email_verifications`'

export type ConsumedVerification = { userId: number; email: string }

const randomId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Ends every unused link for the account, then stores the new one. A fresh email supersedes the old. */
export async function storeVerificationToken(
  userId: number,
  email: string,
  tokenHash: string,
  expiresAt: string,
  now: Date = new Date(),
): Promise<void> {
  const d1 = await resolveD1Binding()
  const stamp = now.toISOString()
  await d1.prepare(`UPDATE ${TABLE} SET used_at = ? WHERE user_id = ? AND used_at IS NULL`).bind(stamp, userId).run()
  await d1
    .prepare(`INSERT INTO ${TABLE} (id, user_id, email, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(randomId(), userId, email, tokenHash, stamp, expiresAt)
    .run()
}

/**
 * Spends a token: marks it used and returns whose it was, or null when it is unknown,
 * already used or expired. One statement, so two clicks cannot both succeed.
 */
export async function consumeVerificationToken(tokenHash: string, now: Date = new Date()): Promise<ConsumedVerification | null> {
  if (!tokenHash) return null
  const d1 = await resolveD1Binding()
  const stamp = now.toISOString()
  const { results } = await d1
    .prepare(
      `UPDATE ${TABLE} SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id, email`,
    )
    .bind(stamp, tokenHash, stamp)
    .all<{ user_id: number; email: string }>()
  const row = results?.[0]
  return row ? { userId: Number(row.user_id), email: String(row.email) } : null
}

/** When the newest verification email for this account was sent (ISO), or null. */
export async function latestVerificationSentAt(userId: number): Promise<string | null> {
  const d1 = await resolveD1Binding()
  const row = await d1
    .prepare(`SELECT created_at FROM ${TABLE} WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(userId)
    .first<{ created_at: string }>()
  return row?.created_at ?? null
}

/** Ends every unused link for the account (used when an admin marks it verified). */
export async function voidVerificationTokens(userId: number, now: Date = new Date()): Promise<void> {
  const d1 = await resolveD1Binding()
  await d1.prepare(`UPDATE ${TABLE} SET used_at = ? WHERE user_id = ? AND used_at IS NULL`).bind(now.toISOString(), userId).run()
}
