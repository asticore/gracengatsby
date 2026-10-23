import { sql } from 'drizzle-orm'
import type { Access } from '@/engine'

export type ProtectedCollection = 'pages' | 'posts'

/**
 * Ids of every password-protected document in a collection, from one query.
 * Throws when the lookup fails; callers pick their own fail-closed behaviour.
 */
export async function getProtectedIds(collection: ProtectedCollection): Promise<Set<number>> {
  // Lazy import: collections import this file, and connect pulls in the schema built from collections.
  const { getDb } = await import('@/cms/db/connect')
  const db = await getDb()
  const rows = (await db.all(
    sql`SELECT doc_id FROM \`eg_content_passwords\` WHERE collection = ${collection}`
  )) as { doc_id: number | string }[]
  return new Set((rows ?? []).map((row) => Number(row.doc_id)))
}

/**
 * Drops password-protected documents from a list. Fails CLOSED: when the
 * lookup errors, nothing is returned rather than risk leaking a protected doc.
 */
export async function excludeProtected<T extends { id?: number | string | null }>(
  collection: ProtectedCollection,
  docs: T[],
): Promise<T[]> {
  try {
    const ids = await getProtectedIds(collection)
    if (ids.size === 0) return docs
    return docs.filter((doc) => !ids.has(Number(doc.id)))
  } catch {
    return []
  }
}

/**
 * Wraps a collection read-access function so anyone who is not granted full
 * access (admins and full-read roles get `true` and are untouched) cannot read
 * password-protected documents over REST or GraphQL. Fails CLOSED: when the
 * lookup errors, the restricted read is denied.
 */
export function excludeProtectedAccess(collection: ProtectedCollection, base: Access): Access {
  return async (args) => {
    const result = await base(args)
    if (result === true || result === false) return result
    try {
      const ids = await getProtectedIds(collection)
      if (ids.size === 0) return result
      return { and: [result, { id: { not_in: [...ids] } }] } as typeof result
    } catch {
      return false
    }
  }
}
</content>
