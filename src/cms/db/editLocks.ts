import { sql } from 'drizzle-orm'
import type { Drizzle } from '@/localapi/migrate'

/**
 * Data access for eg_edit_locks table.
 * Optimistic locking during collaborative editing. A lock is stale after 60s without heartbeat.
 * The same user always keeps the lock even after stale.
 * Workers-safe: uses raw SQL with the same db handle as other custom-table code.
 */

export interface UserInfo {
  userId: number
  label: string
}

export interface LockStatus {
  held: true
}

export interface LockNotHeld {
  held: false
  by: UserInfo
}

/**
 * Acquire a lock or heartbeat an existing one.
 * Returns {held: true} if acquired/refreshed, or {held: false, by: {...}} if held by someone else.
 * A lock is stale after 60s without heartbeat; same user always reacquires it.
 */
export async function acquire(
  engineOrDb: Drizzle,
  collection: string,
  docId: number,
  user: UserInfo,
): Promise<LockStatus | LockNotHeld> {
  const now = Math.floor(Date.now() / 1000) // Unix timestamp in seconds
  const staleThreshold = now - 60 // 60 seconds ago

  const rows = (await engineOrDb.all(
    sql`SELECT user_id, user_label, heartbeat_at FROM \`eg_edit_locks\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { user_id: number; user_label: string; heartbeat_at: number }[]

  const existing = rows[0]

  if (!existing) {
    // No lock exists, acquire it
    await engineOrDb.run(
      sql`INSERT INTO \`eg_edit_locks\` (collection, doc_id, user_id, user_label, heartbeat_at)
          VALUES (${collection}, ${docId}, ${user.userId}, ${user.label}, ${now})`
    )
    return { held: true }
  }

  if (existing.user_id === user.userId) {
    // Same user, refresh heartbeat
    await engineOrDb.run(
      sql`UPDATE \`eg_edit_locks\` SET heartbeat_at = ${now}, user_label = ${user.label}
          WHERE collection = ${collection} AND doc_id = ${docId}`
    )
    return { held: true }
  }

  if (existing.heartbeat_at < staleThreshold) {
    // Lock is stale and held by someone else; take it over
    await engineOrDb.run(
      sql`UPDATE \`eg_edit_locks\` SET user_id = ${user.userId}, user_label = ${user.label}, heartbeat_at = ${now}
          WHERE collection = ${collection} AND doc_id = ${docId}`
    )
    return { held: true }
  }

  // Lock is held and not stale
  return {
    held: false,
    by: { userId: existing.user_id, label: existing.user_label },
  }
}

/**
 * Heartbeat an existing lock without trying to acquire.
 * Returns {held: true} if this user holds it, {held: false, by: {...}} otherwise.
 */
export async function heartbeat(
  engineOrDb: Drizzle,
  collection: string,
  docId: number,
  user: UserInfo,
): Promise<LockStatus | LockNotHeld> {
  const now = Math.floor(Date.now() / 1000)
  const rows = (await engineOrDb.all(
    sql`SELECT user_id, user_label FROM \`eg_edit_locks\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { user_id: number; user_label: string }[]

  const existing = rows[0]

  if (!existing) {
    return {
      held: false,
      by: { userId: -1, label: 'none' }, // No lock exists
    }
  }

  if (existing.user_id === user.userId) {
    await engineOrDb.run(
      sql`UPDATE \`eg_edit_locks\` SET heartbeat_at = ${now}, user_label = ${user.label}
          WHERE collection = ${collection} AND doc_id = ${docId}`
    )
    return { held: true }
  }

  return {
    held: false,
    by: { userId: existing.user_id, label: existing.user_label },
  }
}

export async function getLock(engineOrDb: Drizzle, collection: string, docId: number): Promise<UserInfo | null> {
  const rows = (await engineOrDb.all(
    sql`SELECT user_id, user_label FROM \`eg_edit_locks\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { user_id: number; user_label: string }[]
  if (!rows[0]) return null
  return { userId: rows[0].user_id, label: rows[0].user_label }
}

export async function release(engineOrDb: Drizzle, collection: string, docId: number, userId: number): Promise<void> {
  await engineOrDb.run(
    sql`DELETE FROM \`eg_edit_locks\` WHERE collection = ${collection} AND doc_id = ${docId} AND user_id = ${userId}`
  )
}

/**
 * Force a different user to take over the lock (used when forcibly breaking a stale lock).
 */
export async function takeOver(engineOrDb: Drizzle, collection: string, docId: number, user: UserInfo): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await engineOrDb.run(
    sql`INSERT INTO \`eg_edit_locks\` (collection, doc_id, user_id, user_label, heartbeat_at)
        VALUES (${collection}, ${docId}, ${user.userId}, ${user.label}, ${now})
        ON CONFLICT(collection, doc_id) DO UPDATE SET user_id = excluded.user_id, user_label = excluded.user_label, heartbeat_at = excluded.heartbeat_at`
  )
}
