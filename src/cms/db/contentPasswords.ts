import { sql } from 'drizzle-orm'
import type { Drizzle } from '@/localapi/migrate'

/**
 * Data access for eg_content_passwords table.
 * Stores PBKDF2-hashed passwords protecting access to individual documents.
 * Workers-safe: uses raw SQL with the same db handle as other custom-table code.
 *
 * A row can instead point at a shared password group (group_id). Its effective
 * hash is then the group's hash. If that group has gone missing the item stays
 * locked: UNUSABLE_HASH never verifies, so no unlock cookie can be issued.
 */

export const UNUSABLE_HASH = 'unusable'

/** The password hash that protects a document, or null when the document is not protected. */
export async function getPasswordHash(engineOrDb: Drizzle, collection: string, docId: number): Promise<string | null> {
  const rows = (await engineOrDb.all(
    sql`SELECT CASE WHEN c.group_id IS NULL THEN c.hash ELSE COALESCE(g.hash, ${UNUSABLE_HASH}) END AS hash
        FROM \`eg_content_passwords\` c
        LEFT JOIN \`eg_password_groups\` g ON g.id = c.group_id
        WHERE c.collection = ${collection} AND c.doc_id = ${docId}`
  )) as { hash: string }[]
  return rows[0]?.hash ?? null
}

/** Sets the item's own password. Takes the item out of any shared group. */
export async function setPasswordHash(engineOrDb: Drizzle, collection: string, docId: number, hash: string): Promise<void> {
  const now = new Date().toISOString()
  await engineOrDb.run(
    sql`INSERT INTO \`eg_content_passwords\` (collection, doc_id, hash, updated_at)
        VALUES (${collection}, ${docId}, ${hash}, ${now})
        ON CONFLICT(collection, doc_id) DO UPDATE SET hash = excluded.hash, group_id = NULL, updated_at = excluded.updated_at`
  )
}

export async function clearPassword(engineOrDb: Drizzle, collection: string, docId: number): Promise<void> {
  await engineOrDb.run(sql`DELETE FROM \`eg_content_passwords\` WHERE collection = ${collection} AND doc_id = ${docId}`)
}
