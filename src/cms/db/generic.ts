import type { CollectionConfig, Where } from '@/engine'

import { and, eq, like, sql } from 'drizzle-orm'
import type { AnySQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core'

import { getDb } from './connect'
import { buildWhere } from './where'

export type Doc = Record<string, unknown> & { id: number }

/** One child table per block type, keyed by block slug - what generateBlockTables produces for a single `blocks` field. */
export type BlockTypeDef = { table: AnySQLiteTable; relsFieldTargets: Record<string, string> }

/** The shared `_rels` table for a parent table - what generateRelsTable produces. */
export type RelsTableDef = { table: AnySQLiteTable; targetColumns: Record<string, string> }

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
 * `rels` is the same idea for hasMany/polymorphic relationship and upload
 * fields, and for `blocks` fields - see RelsTableDef/BlockTypeDef above and
 * ./schema/generate.ts's generateRelsTable/generateBlockTables for the real
 * D1 shapes this mirrors (confirmed against eg_page_templates_rels and
 * eg_page_templates_blocks_*, created via a real engine.create() call and
 * inspected directly - not guessed):
 *
 *   - `relsTable`: the parent's own shared `_rels` table, if it has any
 *     hasMany/polymorphic field anywhere (top-level or inside a block).
 *   - `topLevelRelsFieldTargets`: top-level hasMany field name -> the single
 *     collection slug it targets. Nothing in this app has one of these yet
 *     (every hasMany relationship/upload field here lives inside a block),
 *     so this is exercised by nothing but is wired up for whenever one shows
 *     up, rather than being a second half-finished feature.
 *   - `blocksFields`: blocks field name -> its per-block-type table defs.
 *     Reading merges every block type's rows for a document, sorts by the
 *     shared `_order` sequence (confirmed sequential across types, not
 *     per-type), and re-attaches each block's own hasMany subfields by
 *     querying `relsTable` with `path` = `<blocksFieldName>.<index>.<subField>`
 *     - `<index>` being the block's 0-based position in that merged order,
 *     which is NOT the same number as its 1-based `_order` value. Writing
 *     replaces every block row and every rels row nested under this field
 *     wholesale, same "delete then reinsert" approach as arrays.
 *
 * Static `defaultValue`s from the collection config are applied on create
 * when the caller omits that field, matching what Payload's own validation
 * layer does before it ever reaches the database adapter - a function
 * default (a per-request computed value) is a Payload-level concern, not the
 * database's, so those are left for the caller to resolve first.
 */
export function createCollectionOps(
  table: AnySQLiteTable,
  collection: CollectionConfig,
  arrayTables: Record<string, AnySQLiteTable> = {},
  rels: {
    relsTable?: RelsTableDef
    topLevelRelsFieldTargets?: Record<string, string>
    blocksFields?: Record<string, { blockTypes: Record<string, BlockTypeDef> }>
  } = {},
) {
  const columns = table as unknown as Record<string, SQLiteColumn>
  const idColumn = columns.id
  const arrayFieldNames = Object.keys(arrayTables)

  const { relsTable, topLevelRelsFieldTargets = {}, blocksFields = {} } = rels
  const relsColumns = relsTable ? (relsTable.table as unknown as Record<string, SQLiteColumn>) : undefined
  const topLevelRelsFieldNames = Object.keys(topLevelRelsFieldTargets)
  const blocksFieldNames = Object.keys(blocksFields)

  function relsColumnFor(targetSlug: string): string {
    if (!relsTable) {
      throw new Error(`createCollectionOps: a relsField targets "${targetSlug}" but no relsTable was given.`)
    }
    const columnKey = relsTable.targetColumns[targetSlug]
    if (!columnKey) {
      throw new Error(`createCollectionOps: relsTable has no column for target collection "${targetSlug}" - check generateRelsTable's inputs.`)
    }
    return columnKey
  }

  const defaults: Record<string, unknown> = {}
  for (const field of collection.fields) {
    const named = field as { name?: string; defaultValue?: unknown }
    if (named.name && named.defaultValue !== undefined && typeof named.defaultValue !== 'function') {
      defaults[named.name] = named.defaultValue
    }
  }

  function splitSpecialFields(data: Record<string, unknown>) {
    const scalars = { ...data }
    const arrays: Record<string, unknown[]> = {}
    for (const name of arrayFieldNames) {
      if (name in scalars) {
        arrays[name] = (scalars[name] as unknown[]) ?? []
        delete scalars[name]
      }
    }
    const topLevelRels: Record<string, number[]> = {}
    for (const name of topLevelRelsFieldNames) {
      if (name in scalars) {
        topLevelRels[name] = (scalars[name] as number[]) ?? []
        delete scalars[name]
      }
    }
    const blocks: Record<string, Record<string, unknown>[]> = {}
    for (const name of blocksFieldNames) {
      if (name in scalars) {
        blocks[name] = (scalars[name] as Record<string, unknown>[]) ?? []
        delete scalars[name]
      }
    }
    return { scalars, arrays, topLevelRels, blocks }
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

  /** Reads one hasMany/polymorphic field's related ids, ordered - shared by top-level fields (`path` = field name) and blocks-nested ones (`path` = `<blocksField>.<index>.<field>`). */
  async function readRelsIds(parentId: number, path: string, targetColumnKey: string): Promise<number[]> {
    if (!relsTable || !relsColumns) return []
    const db = await getDb()
    const rows = await db
      .select()
      .from(relsTable.table)
      .where(and(eq(relsColumns.parentId, parentId), eq(relsColumns.path, path)))
      .orderBy(relsColumns.order)
    return (rows as Record<string, unknown>[]).map((row) => row[targetColumnKey] as number).filter((value) => value != null)
  }

  /** Replaces one hasMany/polymorphic field's related ids wholesale - delete every row at this exact path, then reinsert in order (1-based, matching the real `eg_page_templates_rels`/`eg_faq_settings_rels` data - confirmed by inspection, not guessed). */
  async function writeRelsIds(parentId: number, path: string, targetColumnKey: string, ids: number[]): Promise<void> {
    if (!relsTable || !relsColumns) return
    const db = await getDb()
    await db.delete(relsTable.table).where(and(eq(relsColumns.parentId, parentId), eq(relsColumns.path, path)))
    if (ids.length) {
      await db.insert(relsTable.table).values(ids.map((relId, index) => ({ parentId, path, order: index + 1, [targetColumnKey]: relId })))
    }
  }

  async function attachTopLevelRels(doc: Doc): Promise<Doc> {
    if (!topLevelRelsFieldNames.length) return doc
    const withRels: Doc = { ...doc }
    for (const [fieldName, targetSlug] of Object.entries(topLevelRelsFieldTargets)) {
      withRels[fieldName] = await readRelsIds(doc.id, fieldName, relsColumnFor(targetSlug))
    }
    return withRels
  }

  async function writeTopLevelRels(id: number, topLevelRels: Record<string, number[]>): Promise<void> {
    for (const [fieldName, ids] of Object.entries(topLevelRels)) {
      const targetSlug = topLevelRelsFieldTargets[fieldName]
      await writeRelsIds(id, fieldName, relsColumnFor(targetSlug), ids)
    }
  }

  /** Reconstructs every `blocks` field on a document - merges each block type's own child-table rows into one array ordered by the shared `_order` sequence, then re-attaches each block's own hasMany subfields from `relsTable`. */
  async function attachBlocksFields(doc: Doc): Promise<Doc> {
    if (!blocksFieldNames.length) return doc
    const db = await getDb()
    const withBlocks: Doc = { ...doc }

    for (const [fieldName, { blockTypes }] of Object.entries(blocksFields)) {
      const perType: { slug: string; row: Record<string, unknown> }[] = []
      for (const [slug, def] of Object.entries(blockTypes)) {
        const blockColumns = def.table as unknown as Record<string, SQLiteColumn>
        const rows = await db.select().from(def.table).where(eq(blockColumns.parentId, doc.id)).orderBy(blockColumns.order)
        for (const row of rows as Record<string, unknown>[]) perType.push({ slug, row })
      }
      perType.sort((a, b) => (a.row.order as number) - (b.row.order as number))

      withBlocks[fieldName] = await Promise.all(
        perType.map(async ({ slug, row }, index) => {
          const { order: _order, parentId: _parentId, path: _path, ...rest } = row
          const def = blockTypes[slug]
          for (const [subFieldName, targetSlug] of Object.entries(def.relsFieldTargets)) {
            rest[subFieldName] = await readRelsIds(doc.id, `${fieldName}.${index}.${subFieldName}`, relsColumnFor(targetSlug))
          }
          return { ...rest, blockType: slug }
        }),
      )
    }
    return withBlocks
  }

  /** Replaces every `blocks` field's rows (and their nested rels rows) wholesale, same approach as writeArrays/writeRelsIds. */
  async function writeBlocksFields(id: number, blocks: Record<string, Record<string, unknown>[]>): Promise<void> {
    if (!Object.keys(blocks).length) return
    const db = await getDb()

    for (const [fieldName, items] of Object.entries(blocks)) {
      const { blockTypes } = blocksFields[fieldName]

      for (const def of Object.values(blockTypes)) {
        const blockColumns = def.table as unknown as Record<string, SQLiteColumn>
        await db.delete(def.table).where(eq(blockColumns.parentId, id))
      }
      if (relsTable && relsColumns) {
        await db.delete(relsTable.table).where(and(eq(relsColumns.parentId, id), like(relsColumns.path, `${fieldName}.%`)))
      }

      const rowsByType = new Map<string, Record<string, unknown>[]>()
      for (const [index, item] of items.entries()) {
        const blockType = item.blockType as string
        const def = blockTypes[blockType]
        if (!def) {
          throw new Error(`writeBlocksFields: unknown block type "${blockType}" for field "${fieldName}".`)
        }
        const { blockType: _blockType, id: itemId, blockName, ...fields } = item

        const scalars: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(fields)) {
          if (def.relsFieldTargets[key]) continue
          scalars[key] = value
        }

        const row = {
          ...scalars,
          id: (itemId as string) || crypto.randomUUID(),
          order: index + 1,
          parentId: id,
          path: fieldName,
          blockName: blockName ?? null,
        }
        if (!rowsByType.has(blockType)) rowsByType.set(blockType, [])
        rowsByType.get(blockType)!.push(row)

        for (const [subFieldName, targetSlug] of Object.entries(def.relsFieldTargets)) {
          const ids = (fields[subFieldName] as number[]) ?? []
          if (ids.length) {
            await db.insert(relsTable!.table).values(
              ids.map((relId, relIndex) => ({
                parentId: id,
                path: `${fieldName}.${index}.${subFieldName}`,
                order: relIndex + 1,
                [relsColumnFor(targetSlug)]: relId,
              })),
            )
          }
        }
      }

      for (const [blockType, rows] of rowsByType) {
        await db.insert(blockTypes[blockType].table).values(rows)
      }
    }
  }

  async function attachExtras(doc: Doc): Promise<Doc> {
    return attachBlocksFields(await attachTopLevelRels(await attachArrays(doc)))
  }

  async function findMany(args: { where?: Where; limit?: number } = {}): Promise<Doc[]> {
    const db = await getDb()
    const condition = buildWhere(columns, args.where)
    const rows = (await db
      .select()
      .from(table)
      .where(condition)
      .limit(args.limit ?? 1000)) as Doc[]
    return Promise.all(rows.map(attachExtras))
  }

  async function findByID(id: number): Promise<Doc | null> {
    const db = await getDb()
    const [row] = await db.select().from(table).where(eq(idColumn, id)).limit(1)
    return row ? attachExtras(row as Doc) : null
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
    const { scalars, arrays, topLevelRels, blocks } = splitSpecialFields(data)
    const values = { ...defaults, ...scalars, updatedAt: now, createdAt: now }
    const [row] = await db.insert(table).values(values).returning()
    const id = (row as Doc).id
    await writeArrays(id, arrays)
    await writeTopLevelRels(id, topLevelRels)
    await writeBlocksFields(id, blocks)
    return attachExtras(row as Doc)
  }

  async function updateByID(id: number, data: Record<string, unknown>): Promise<Doc | null> {
    const db = await getDb()
    const { scalars, arrays, topLevelRels, blocks } = splitSpecialFields(data)
    const [row] = await db
      .update(table)
      .set({ ...scalars, updatedAt: new Date().toISOString() })
      .where(eq(idColumn, id))
      .returning()
    if (!row) return null
    await writeArrays(id, arrays)
    await writeTopLevelRels(id, topLevelRels)
    await writeBlocksFields(id, blocks)
    return attachExtras(row as Doc)
  }

  async function deleteByID(id: number): Promise<boolean> {
    const db = await getDb()
    // Child rows cascade at the D1 level (generateArrayTable's _parent_id and
    // generateBlockTables' _parent_id are both ON DELETE cascade, matching the
    // real schema) - nothing extra here. relsTable rows also cascade the same
    // way (generateRelsTable's parent_id, confirmed against eg_page_templates_rels).
    const result = await db.delete(table).where(eq(idColumn, id)).returning({ id: idColumn })
    return result.length > 0
  }

  return { findMany, findByID, count, create, updateByID, deleteByID }
}
