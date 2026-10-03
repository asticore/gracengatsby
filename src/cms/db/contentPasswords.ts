import { sql } from 'drizzle-orm'
import type { Drizzle } from '@/localapi/migrate'

/**
 * Data access for eg_content_passwords table.
 * Stores bcrypt-hashed passwords protecting access to individual documents.
 * Workers-safe: uses raw SQL with the same db handle as other custom-table code.
 */

export async function getPasswordHash(engineOrDb: Drizzle, collection: string, docId: number): Promise<string | null> {
  const rows = (await engineOrDb.all(
    sql`SELECT hash FROM \`eg_content_passwords\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { hash: string }[]
  return rows[0]?.hash ?? null
}

export async function setPasswordHash(engineOrDb: Drizzle, collection: string, docId: number, hash: string): Promise<void> {
  const now = new Date().toISOString()
  await engineOrDb.run(
    sql`INSERT INTO \`eg_content_passwords\` (collection, doc_id, hash, updated_at)
        VALUES (${collection}, ${docId}, ${hash}, ${now})
        ON CONFLICT(collection, doc_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`
  )
}

export async function clearPassword(engineOrDb: Drizzle, collection: string, docId: number): Promise<void> {
  await engineOrDb.run(sql`DELETE FROM \`eg_content_passwords\` WHERE collection = ${collection} AND doc_id = ${docId}`)
}
