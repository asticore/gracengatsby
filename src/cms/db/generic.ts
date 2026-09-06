import type { CollectionConfig, Where } from '@/engine'

import { eq, sql } from 'drizzle-orm'
import type { AnySQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core'

import { getDb } from './connect'
import { buildWhere } from './where'

export type Doc = Record<string, unknown> & { id: number }

/**
 * One set of find/create/update/delete operations, generic over any table
 * ./schema/generate.ts produced - the generalisation ./schema/generate.ts
 * promised for schema, mirrored here for the operations that read and write
 * it. A collection's thin wrapper (see ./collections/eventRSVPs.ts) is just
 * this factory plus the types callers see; there is no more per-collection
 * SQL to hand-write.
 *
 * Static `defaultValue`s from the collection config are applied on create
 * when the caller omits that field, matching what Payload's own validation
 * layer does before it ever reaches the database adapter - a function
 * default (a per-request computed value) is a Payload-level concern, not the
 * database's, so those are left for the caller to resolve first.
 */
export function createCollectionOps(table: AnySQLiteTable, collection: CollectionConfig) {
  const columns = table as unknown as Record<string, SQLiteColumn>
  const idColumn = columns.id

  const defaults: Record<string, unknown> = {}
  for (const field of collection.fields) {
    const named = field as { name?: string; defaultValue?: unknown }
    if (named.name && named.defaultValue !== undefined && typeof named.defaultValue !== 'function') {
      defaults[named.name] = named.defaultValue
    }
  }

  async function findMany(args: { where?: Where; limit?: number } = {}): Promise<Doc[]> {
    const db = await getDb()
    const condition = buildWhere(columns, args.where)
    const rows = await db
      .select()
      .from(table)
      .where(condition)
      .limit(args.limit ?? 1000)
    return rows as Doc[]
  }

  async function findByID(id: number): Promise<Doc | null> {
    const db = await getDb()
    const [row] = await db.select().from(table).where(eq(idColumn, id)).limit(1)
    return (row as Doc) ?? null
  }

  async function count(args: { where?: Where } = {}): Promise<number> {
    const db = await getDb()
    const condition = buildWhere(columns, args.where)
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(table)
      .where(condition)
    return row?.n ?? 0
  }

  async function create(data: Record<string, unknown>): Promise<Doc> {
    const db = await getDb()
    const now = new Date().toISOString()
    const values = { ...defaults, ...data, updatedAt: now, createdAt: now }
    const [row] = await db.insert(table).values(values).returning()
    return row as Doc
  }

  async function updateByID(id: number, data: Record<string, unknown>): Promise<Doc | null> {
    const db = await getDb()
    const [row] = await db
      .update(table)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(idColumn, id))
      .returning()
    return (row as Doc) ?? null
  }

  async function deleteByID(id: number): Promise<boolean> {
    const db = await getDb()
    const result = await db.delete(table).where(eq(idColumn, id)).returning({ id: idColumn })
    return result.length > 0
  }

  return { findMany, findByID, count, create, updateByID, deleteByID }
}
