import { sql } from 'drizzle-orm'
import type { Drizzle } from '@/localapi/migrate'

/**
 * Data access for shared password groups and per-item member unlock rules.
 * An item is protected when it has a row in eg_content_passwords; group_id on
 * that row points at a shared group whose password then protects the item.
 * Raw SQL, same as contentPasswords.ts.
 */

/** Most items one group password may unlock. Each one becomes a cookie on unlock. */
export const MAX_GROUP_MEMBERS = 25
export const MAX_GROUP_NAME = 80
export const UNLOCK_ROLES = ['admin', 'editor', 'viewer', 'customer'] as const
export const MAX_UNLOCK_TIERS = 50

export type PasswordGroupSummary = { id: number; name: string; updatedAt: string; memberCount: number }

export async function listPasswordGroups(db: Drizzle): Promise<PasswordGroupSummary[]> {
  const rows = (await db.all(
    sql`SELECT g.id, g.name, g.updated_at, (SELECT COUNT(*) FROM \`eg_content_passwords\` c WHERE c.group_id = g.id) AS member_count
        FROM \`eg_password_groups\` g ORDER BY g.name`,
  )) as { id: number | string; name: string; updated_at: string; member_count: number | string }[]
  return (rows ?? []).map((row) => ({
    id: Number(row.id),
    name: row.name,
    updatedAt: row.updated_at,
    memberCount: Number(row.member_count),
  }))
}

export async function getPasswordGroup(db: Drizzle, id: number): Promise<{ id: number; name: string; hash: string } | null> {
  const rows = (await db.all(sql`SELECT id, name, hash FROM \`eg_password_groups\` WHERE id = ${id}`)) as {
    id: number | string
    name: string
    hash: string
  }[]
  const row = rows?.[0]
  return row ? { id: Number(row.id), name: row.name, hash: row.hash } : null
}

/** Returns the new id. Throws on a duplicate name (unique index). */
export async function createPasswordGroup(db: Drizzle, name: string, hash: string): Promise<number> {
  const now = new Date().toISOString()
  const rows = (await db.all(
    sql`INSERT INTO \`eg_password_groups\` (name, hash, created_at, updated_at) VALUES (${name}, ${hash}, ${now}, ${now}) RETURNING id`,
  )) as { id: number | string }[]
  return Number(rows[0].id)
}

export async function updatePasswordGroup(db: Drizzle, id: number, changes: { name?: string; hash?: string }): Promise<void> {
  const now = new Date().toISOString()
  if (changes.name !== undefined) {
    await db.run(sql`UPDATE \`eg_password_groups\` SET name = ${changes.name}, updated_at = ${now} WHERE id = ${id}`)
  }
  if (changes.hash !== undefined) {
    await db.run(sql`UPDATE \`eg_password_groups\` SET hash = ${changes.hash}, updated_at = ${now} WHERE id = ${id}`)
  }
}

/** Refuses (returns 'in-use') while any item still points at the group: deleting it would leave those items with no password. */
export async function deletePasswordGroup(db: Drizzle, id: number): Promise<'deleted' | 'in-use'> {
  const used = (await db.all(sql`SELECT COUNT(*) AS n FROM \`eg_content_passwords\` WHERE group_id = ${id}`)) as { n: number | string }[]
  if (Number(used?.[0]?.n ?? 0) > 0) return 'in-use'
  await db.run(sql`DELETE FROM \`eg_password_groups\` WHERE id = ${id}`)
  return 'deleted'
}

export async function getItemGroupId(db: Drizzle, collection: string, docId: number): Promise<number | null> {
  const rows = (await db.all(
    sql`SELECT group_id FROM \`eg_content_passwords\` WHERE collection = ${collection} AND doc_id = ${docId}`,
  )) as { group_id: number | string | null }[]
  const value = rows?.[0]?.group_id
  return value === null || value === undefined ? null : Number(value)
}

export async function groupMembers(db: Drizzle, groupId: number): Promise<{ collection: string; docId: number }[]> {
  const rows = (await db.all(
    sql`SELECT collection, doc_id FROM \`eg_content_passwords\` WHERE group_id = ${groupId} ORDER BY collection, doc_id LIMIT ${MAX_GROUP_MEMBERS}`,
  )) as { collection: string; doc_id: number | string }[]
  return (rows ?? []).map((row) => ({ collection: row.collection, docId: Number(row.doc_id) }))
}

/**
 * Points an item at a group. Creates the protection row when there is none;
 * the row's own hash is then left empty, because the group password is used.
 */
export async function setItemGroup(db: Drizzle, collection: string, docId: number, groupId: number): Promise<void> {
  const now = new Date().toISOString()
  await db.run(
    sql`INSERT INTO \`eg_content_passwords\` (collection, doc_id, hash, updated_at, group_id)
        VALUES (${collection}, ${docId}, '', ${now}, ${groupId})
        ON CONFLICT(collection, doc_id) DO UPDATE SET group_id = excluded.group_id, updated_at = excluded.updated_at`,
  )
}

export type UnlockRules = { roles: string[]; tiers: number[] }

/** Null when the item is not protected. Empty arrays when protected with no member unlock. */
export async function getUnlockRules(db: Drizzle, collection: string, docId: number): Promise<UnlockRules | null> {
  const rows = (await db.all(
    sql`SELECT unlock_roles, unlock_tiers FROM \`eg_content_passwords\` WHERE collection = ${collection} AND doc_id = ${docId}`,
  )) as { unlock_roles: string | null; unlock_tiers: string | null }[]
  const row = rows?.[0]
  if (!row) return null
  return {
    roles: parseList(row.unlock_roles).map(String),
    tiers: parseList(row.unlock_tiers).map(Number).filter((n) => Number.isInteger(n) && n > 0),
  }
}

/** Only touches an existing protection row. Returns false when the item is not protected. */
export async function setUnlockRules(db: Drizzle, collection: string, docId: number, rules: UnlockRules): Promise<boolean> {
  const rows = (await db.all(
    sql`UPDATE \`eg_content_passwords\` SET unlock_roles = ${JSON.stringify(rules.roles)}, unlock_tiers = ${JSON.stringify(rules.tiers)}
        WHERE collection = ${collection} AND doc_id = ${docId} RETURNING doc_id`,
  )) as unknown[]
  return Array.isArray(rows) && rows.length > 0
}

const parseList = (raw: string | null): unknown[] => {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}
