import { sql } from 'drizzle-orm'
import type { Drizzle } from '@/localapi/migrate'

/**
 * Data access for eg_password_groups and eg_content_access (see
 * src/migrations/20261123_100000_password_groups.ts). Raw SQL on the same db handle as
 * contentPasswords.ts. Only hashes are stored; nothing here returns one except getGroup, which the
 * unlock route needs to verify a password.
 */

export type ContentAccessMode = 'group' | 'accounts'

export type PasswordGroupRow = {
  id: number
  name: string
  hash: string
  expiresAt: string | null
  maxUses: number | null
  useCount: number
  createdAt: string
  updatedAt: string
}

export type ContentAccessRule = {
  collection: string
  docId: number
  mode: ContentAccessMode
  groupId: number | null
  roles: string[]
  tiers: string[]
}

type RawGroup = {
  id: number | string
  name: string
  hash: string
  expires_at: string | null
  max_uses: number | string | null
  use_count: number | string | null
  created_at: string
  updated_at: string
}

const toGroup = (r: RawGroup): PasswordGroupRow => ({
  id: Number(r.id),
  name: r.name,
  hash: r.hash,
  expiresAt: r.expires_at ?? null,
  maxUses: r.max_uses === null || r.max_uses === undefined ? null : Number(r.max_uses),
  useCount: Number(r.use_count ?? 0),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const parseList = (value: unknown): string[] => {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.length > 0) : []
  } catch {
    return []
  }
}

export async function getGroup(db: Drizzle, id: number): Promise<PasswordGroupRow | null> {
  const rows = (await db.all(sql`SELECT * FROM \`eg_password_groups\` WHERE id = ${id}`)) as RawGroup[]
  return rows[0] ? toGroup(rows[0]) : null
}

export async function listGroups(db: Drizzle): Promise<PasswordGroupRow[]> {
  const rows = (await db.all(sql`SELECT * FROM \`eg_password_groups\` ORDER BY name COLLATE NOCASE`)) as RawGroup[]
  return rows.map(toGroup)
}

export async function createGroup(
  db: Drizzle,
  input: { name: string; hash: string; expiresAt: string | null; maxUses: number | null },
): Promise<number> {
  const now = new Date().toISOString()
  const rows = (await db.all(
    sql`INSERT INTO \`eg_password_groups\` (name, hash, expires_at, max_uses, use_count, created_at, updated_at)
        VALUES (${input.name}, ${input.hash}, ${input.expiresAt}, ${input.maxUses}, 0, ${now}, ${now}) RETURNING id`,
  )) as { id: number | string }[]
  return Number(rows[0]?.id)
}

/** Rotate: new hash, use counter back to zero. The hash fingerprint in every outstanding cookie stops matching. */
export async function rotateGroupHash(db: Drizzle, id: number, hash: string): Promise<void> {
  const now = new Date().toISOString()
  await db.run(sql`UPDATE \`eg_password_groups\` SET hash = ${hash}, use_count = 0, updated_at = ${now} WHERE id = ${id}`)
}

export async function updateGroupSettings(
  db: Drizzle,
  id: number,
  input: { name?: string; expiresAt?: string | null; maxUses?: number | null; resetUses?: boolean },
  current: PasswordGroupRow,
): Promise<void> {
  const now = new Date().toISOString()
  const name = input.name ?? current.name
  const expiresAt = input.expiresAt === undefined ? current.expiresAt : input.expiresAt
  const maxUses = input.maxUses === undefined ? current.maxUses : input.maxUses
  const useCount = input.resetUses ? 0 : current.useCount
  await db.run(
    sql`UPDATE \`eg_password_groups\` SET name = ${name}, expires_at = ${expiresAt}, max_uses = ${maxUses}, use_count = ${useCount}, updated_at = ${now} WHERE id = ${id}`,
  )
}

/**
 * Counts one successful unlock, atomically: the cap is part of the UPDATE's WHERE, so two visitors cannot both take
 * the last use. Returns false when the cap is already reached.
 */
export async function consumeGroupUse(db: Drizzle, id: number): Promise<boolean> {
  const rows = (await db.all(
    sql`UPDATE \`eg_password_groups\` SET use_count = use_count + 1 WHERE id = ${id} AND (max_uses IS NULL OR use_count < max_uses) RETURNING id`,
  )) as unknown[]
  return rows.length > 0
}

/** Removes the group and every reference to it. Documents that used it become unprotected by it; callers purge their URLs. */
export async function deleteGroup(db: Drizzle, id: number): Promise<void> {
  await db.run(sql`DELETE FROM \`eg_content_access\` WHERE mode = 'group' AND group_id = ${id}`)
  await db.run(sql`UPDATE \`eg_content_access\` SET group_id = NULL WHERE group_id = ${id}`)
  await db.run(sql`DELETE FROM \`eg_password_groups\` WHERE id = ${id}`)
}

export async function listGroupMembers(db: Drizzle, groupId: number): Promise<{ collection: string; docId: number }[]> {
  const rows = (await db.all(
    sql`SELECT collection, doc_id FROM \`eg_content_access\` WHERE group_id = ${groupId} ORDER BY collection, doc_id`,
  )) as { collection: string; doc_id: number | string }[]
  return rows.map((r) => ({ collection: r.collection, docId: Number(r.doc_id) }))
}

type RawRule = {
  collection: string
  doc_id: number | string
  mode: string
  group_id: number | string | null
  roles: string | null
  tiers: string | null
}

const toRule = (r: RawRule): ContentAccessRule => ({
  collection: r.collection,
  docId: Number(r.doc_id),
  mode: r.mode === 'accounts' ? 'accounts' : 'group',
  groupId: r.group_id === null || r.group_id === undefined ? null : Number(r.group_id),
  roles: parseList(r.roles),
  tiers: parseList(r.tiers),
})

export async function getAccessRule(db: Drizzle, collection: string, docId: number): Promise<ContentAccessRule | null> {
  const rows = (await db.all(
    sql`SELECT collection, doc_id, mode, group_id, roles, tiers FROM \`eg_content_access\` WHERE collection = ${collection} AND doc_id = ${docId}`,
  )) as RawRule[]
  return rows[0] ? toRule(rows[0]) : null
}

export async function setAccessRule(
  db: Drizzle,
  rule: { collection: string; docId: number; mode: ContentAccessMode; groupId: number | null; roles: string[]; tiers: string[] },
): Promise<void> {
  const now = new Date().toISOString()
  await db.run(
    sql`INSERT INTO \`eg_content_access\` (collection, doc_id, mode, group_id, roles, tiers, updated_at)
        VALUES (${rule.collection}, ${rule.docId}, ${rule.mode}, ${rule.groupId}, ${JSON.stringify(rule.roles)}, ${JSON.stringify(rule.tiers)}, ${now})
        ON CONFLICT(collection, doc_id) DO UPDATE SET mode = excluded.mode, group_id = excluded.group_id,
          roles = excluded.roles, tiers = excluded.tiers, updated_at = excluded.updated_at`,
  )
}

export async function clearAccessRule(db: Drizzle, collection: string, docId: number): Promise<void> {
  await db.run(sql`DELETE FROM \`eg_content_access\` WHERE collection = ${collection} AND doc_id = ${docId}`)
}
