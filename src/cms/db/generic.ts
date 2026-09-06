import type { CollectionConfig, Where } from '@/engine'

import { eq, sql } from 'drizzle-orm'
import type { AnySQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core'

import { getDb } from './connect'
import { buildWhere } from './where'

export type Doc = Record<string, unknown> & { id: number }

/**
 * One set of find/create/update/delete operations, generic over any table
 * ./schema/generate.ts produced. A collection's thin wrapper (see
 * ./collections/eventRSVPs.ts) is just this factory plus the types callers
 * see; there is no more per-collection SQL to hand-write.
 *
 * `arrayTables` (field name -> child table, from generateArrayTable) is how
 * array fields are assembled into the document shape Payload's own API
 * returns: on read, each array field's child rows are fetched by
 * `_parent_id`, ordered by `_order`, and attached as a plain array under the
 * field name; on write, the field's existing child rows are replaced
 * wholesale with whatever array was given (simpler than diffing rows, and
 * correct - array row ids are opaque to callers of this data layer either
 * way). One extra query per array field per document; fine at this scale,
 * revisit if a collection with many array fields needs batching.
 *
 * Static `defaultValue`s from the collection config are applied on create
 * when the caller omits that field, matching what Payload's own validation
 * layer does before it ever reaches the database adapter - a function
 * default (a per-request computed value) is a Payload-level concern, not the
 * database's, so those are left for the caller to resolve first.
 */
export function createCollectionOps(table: AnySQLiteTable, collection: CollectionConfig, arrayTables: Record<string, AnySQLiteTable> = {}) {
  const columns = table as unknown as Record<string, SQLiteColumn>
  const idColumn = columns.id
  const arrayFieldNames = Object.keys(arrayTables)

  const defaults: Record<string, unknown> = {}
  for (const field of collection.fields) {
    const named = field as { name?: string; defaultValue?: unknown }
    if (named.name && named.defaultValue !== undefined && typeof named.defaultValue !== 'function') {
      defaults[named.name] = named.defaultValue
    }
  }

  function splitArrayFields(data: Record<string, unknown>) {
    const scalars = { ...data }
    const arrays: Record<string, unknown[]> = {}
    for (const name of arrayFieldNames) {
      if (name in scalars) {
        arrays[name] = (scalars[name] as unknown[]) ?? []
        delete scalars[name]
      }
    }
    return { scalars, arrays }
  }

  async function attachArrays(doc: Doc): Promise<Doc> {
    if (!arrayFieldNames.length) return doc
    const db = await getDb()
    const withArrays: Doc = { ...doc }
    for (const name of arrayFieldNames) {
      const childTable = arrayTables[name]
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      const rows = await db.select().from(childTable).where(eq(childColumns.parentId, doc.id)).orderBy(childColumns.order)
      withArrays[name] = rows.map((row) => {
        const { parentId: _parentId, order: _order, ...rest } = row as Record<string, unknown>
        return rest
      })
    }
    return withArrays
  }

  async function writeArrays(id: number, arrays: Record<string, unknown[]>): Promise<void> {
    if (!Object.keys(arrays).length) return
    const db = await getDb()
    for (const [name, items] of Object.entries(arrays)) {
      const childTable = arrayTables[name]
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      await db.delete(childTable).where(eq(childColumns.parentId, id))
      if (items.length) {
        await db.insert(childTable).values(
          items.map((item, index) => ({
            ...(item as Record<string, unknown>),
            id: (item as { id?: string })?.id || crypto.randomUUID(),
            order: index,
            parentId: id,
          })),
        )
      }
    }
  }

  async function findMany(args: { where?: Where; limit?: number } = {}): Promise<Doc[]> {
    const db = await getDb()
    const condition = buildWhere(columns, args.where)
    const rows = (await db
      .select()
      .from(table)
      .where(condition)
      .limit(args.limit ?? 1000)) as Doc[]
    return Promise.all(rows.map(attachArrays))
  }

  async function findByID(id: number): Promise<Doc | null> {
    const db = await getDb()
    const [row] = await db.select().from(table).where(eq(idColumn, id)).limit(1)
    return row ? attachArrays(row as Doc) : null
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
    const { scalars, arrays } = splitArrayFields(data)
    const values = { ...defaults, ...scalars, updatedAt: now, createdAt: now }
    const [row] = await db.insert(table).values(values).returning()
    await writeArrays((row as Doc).id, arrays)
    return attachArrays(row as Doc)
  }

  async function updateByID(id: number, data: Record<string, unknown>): Promise<Doc | null> {
    const db = await getDb()
    const { scalars, arrays } = splitArrayFields(data)
    const [row] = await db
      .update(table)
      .set({ ...scalars, updatedAt: new Date().toISOString() })
      .where(eq(idColumn, id))
      .returning()
    if (!row) return null
    await writeArrays(id, arrays)
    return attachArrays(row as Doc)
  }

  async function deleteByID(id: number): Promise<boolean> {
    const db = await getDb()
    // Child rows cascade at the D1 level (generateArrayTable's _parent_id FK
    // is ON DELETE cascade, matching the real schema) - nothing extra here.
    const result = await db.delete(table).where(eq(idColumn, id)).returning({ id: idColumn })
    return result.length > 0
  }

  return { findMany, findByID, count, create, updateByID, deleteByID }
}
