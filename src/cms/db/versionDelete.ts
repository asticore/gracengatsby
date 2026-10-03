import { eq } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

import { getDb } from './connect'
import { eventsVersions, pagesVersions, postsVersions, productsVersions, coursesVersions } from './schema'

/** Collections that keep version history, mapped to their `_eg_<c>_v` table. */
const VERSION_TABLES = {
  pages: pagesVersions,
  posts: postsVersions,
  events: eventsVersions,
  courses: coursesVersions,
  products: productsVersions,
} as const

export type VersionedCollection = keyof typeof VERSION_TABLES

export function isVersionedCollection(slug: string): slug is VersionedCollection {
  return Object.prototype.hasOwnProperty.call(VERSION_TABLES, slug)
}

export type DeleteVersionResult = 'deleted' | 'not_found' | 'is_latest' | 'wrong_parent'

/**
 * Deletes ONE history row. The newest row (`latest`) mirrors the live
 * document and is never deleted here. When `parentId` is given the row must
 * belong to that document, so an id from another document cannot be removed
 * through this call. Child rows (arrays, blocks, rels) cascade at the D1 level.
 */
export async function deleteVersionRow(
  collection: VersionedCollection,
  versionId: number,
  parentId?: number,
): Promise<DeleteVersionResult> {
  const table = VERSION_TABLES[collection]
  const cols = table as unknown as Record<string, SQLiteColumn>
  const db = await getDb()

  const rows = await db
    .select({ id: cols.id, parent: cols.parentId, latest: cols.latest })
    .from(table)
    .where(eq(cols.id, versionId))
    .limit(1)
  const row = rows[0] as { id: number; parent: number | null; latest: boolean | number | null } | undefined
  if (!row) return 'not_found'
  if (parentId !== undefined && Number(row.parent) !== parentId) return 'wrong_parent'
  if (row.latest) return 'is_latest'

  await db.delete(table).where(eq(cols.id, versionId))
  return 'deleted'
}
