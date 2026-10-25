import { sql } from 'drizzle-orm'
import type { Access } from '@/engine'
import { viewerQualifies, type Viewer } from './access'

export type ProtectedCollection = 'pages' | 'posts' | 'products' | 'events'

/**
 * Ids of every protected document in a collection, from one query: per-document passwords, shared
 * password groups, and accounts rules. A document under an accounts rule is left out of the set only when
 * `viewer` is given and qualifies; with no viewer it is hidden like any other protected document.
 * Throws when the lookup fails; callers pick their own fail-closed behaviour.
 */
export async function getProtectedIds(collection: ProtectedCollection, viewer?: Viewer | null): Promise<Set<number>> {
  // Lazy import: collections import this file, and connect pulls in the schema built from collections.
  const { getDb } = await import('@/cms/db/connect')
  const db = await getDb()
  const rows = (await db.all(
    sql`SELECT doc_id, NULL AS mode, NULL AS roles, NULL AS tiers FROM \`eg_content_passwords\` WHERE collection = ${collection}
        UNION ALL
        SELECT doc_id, mode, roles, tiers FROM \`eg_content_access\` WHERE collection = ${collection}`
  )) as { doc_id: number | string; mode?: string | null; roles?: string | null; tiers?: string | null }[]
  const ids = new Set<number>()
  for (const row of rows ?? []) {
    if (row.mode === 'accounts' && viewer) {
      const rule = { mode: 'accounts' as const, roles: parseList(row.roles), tiers: parseList(row.tiers) }
      if (await viewerQualifies(rule, viewer)) continue
    }
    ids.add(Number(row.doc_id))
  }
  // Documents limited to an organisation's members are kept out of listings the same way. A throw here
  // propagates so every caller fails closed.
  const { listOrgRestrictedIdsLive } = await import('@/features/organizations/visibility')
  for (const id of await listOrgRestrictedIdsLive(collection)) ids.add(id)
  return ids
}

function parseList(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.length > 0) : []
  } catch {
    return []
  }
}

/**
 * Drops password-protected documents from a list. Fails CLOSED: when the
 * lookup errors, nothing is returned rather than risk leaking a protected doc.
 */
export async function excludeProtected<T extends { id?: number | string | null }>(
  collection: ProtectedCollection,
  docs: T[],
  viewer?: Viewer | null,
): Promise<T[]> {
  try {
    const ids = await getProtectedIds(collection, viewer)
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
      const user = (args as { req?: { user?: Viewer['user'] } })?.req?.user
      const viewer: Viewer = {
        user,
        getEngine: async () => (await (await import('@/lib/engine')).getEngine()) as never,
      }
      const ids = await getProtectedIds(collection, viewer)
      if (ids.size === 0) return result
      return { and: [result, { id: { not_in: [...ids] } }] } as typeof result
    } catch {
      return false
    }
  }
}
