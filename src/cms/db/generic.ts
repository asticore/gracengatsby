import type { CollectionConfig, Where } from '@/engine'

import { and, desc, eq, like, sql } from 'drizzle-orm'
import type { AnySQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core'

import { capitalize, type GroupFieldMeta } from './schema/generate'
import { getDb } from './connect'
import { buildWhere } from './where'

export type Doc = Record<string, unknown> & { id: number }

/** One child table per block type, keyed by block slug - what generateBlockTables produces for a single `blocks` field. */
export type BlockTypeDef = { table: AnySQLiteTable; relsFieldTargets: Record<string, string> }

/** The shared `_rels` table for a parent table - what generateRelsTable produces. */
export type RelsTableDef = { table: AnySQLiteTable; targetColumns: Record<string, string> }

/**
 * Reconstructs `group` fields' nested-object document shape from a flat,
 * prefixed drizzle row (`{ seoMetaTitle: ... }` -> `{ seo: { metaTitle: ... } }`)
 * - shared by createCollectionOps (the live table) and createVersionsOps (the
 * `_<table>_v` table), since generateVersionsTable derives the exact same
 * groupFields metadata and JS property-key convention from the same field
 * list, just with `version_`-prefixed columns underneath.
 */
function nestGroups(row: Record<string, unknown>, groupFields: GroupFieldMeta[]): Record<string, unknown> {
  if (!groupFields.length) return row
  const result: Record<string, unknown> = { ...row }
  for (const { name, subFieldNames } of groupFields) {
    const group: Record<string, unknown> = {}
    for (const subName of subFieldNames) {
      const jsKey = `${name}${capitalize(subName)}`
      group[subName] = result[jsKey]
      delete result[jsKey]
    }
    result[name] = group
  }
  return result
}

/** The reverse of nestGroups - flattens a document's nested group objects back into the prefixed JS keys the drizzle table actually has, for insert/update. */
function flattenGroups(data: Record<string, unknown>, groupFields: GroupFieldMeta[]): Record<string, unknown> {
  if (!groupFields.length) return data
  const result: Record<string, unknown> = { ...data }
  for (const { name, subFieldNames } of groupFields) {
    if (!(name in result)) continue
    const groupValue = (result[name] as Record<string, unknown>) ?? {}
    delete result[name]
    for (const subName of subFieldNames) {
      result[`${name}${capitalize(subName)}`] = groupValue[subName]
    }
  }
  return result
}

/** Pulls a version document's `array`/`blocks` field(s) out for separate handling, same idea as createCollectionOps' splitSpecialFields but scoped to just what createVersionsOps supports (no top-level-rels at the version level yet - nothing in this app's versioned collections has one outside a block). */
function splitVersionFields(
  data: Record<string, unknown>,
  arrayFieldNames: string[],
  blocksFieldNames: string[],
): { scalars: Record<string, unknown>; arrays: Record<string, unknown[]>; blocks: Record<string, Record<string, unknown>[]> } {
  const scalars = { ...data }
  const arrays: Record<string, unknown[]> = {}
  for (const name of arrayFieldNames) {
    if (name in scalars) {
      arrays[name] = (scalars[name] as unknown[]) ?? []
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
  return { scalars, arrays, blocks }
}

/**
 * The array-field read+write logic shared by createCollectionOps (the live
 * table) and createVersionsOps (the `_<table>_v` table) - same idea as
 * createBlocksRelsOps below, just for `array` fields: both need "fetch child
 * rows by owning id in `_order`, replace wholesale on write", scoped to a
 * different owning row (the live document's own id vs. the version row's
 * own id - confirmed against real `_eg_posts_v_version_categories`, whose
 * `_parent_id` FK points at `_eg_posts_v` itself, not the live `eg_posts`
 * table, exactly like versioned blocks/rels).
 *
 * `uuidColumn` mirrors createBlocksRelsOps': a live array row's identity is
 * its own `id` column (string, explicitly set - not autoincrement); a
 * VERSIONED array row's identity is its `_uuid` column instead (`id` is a
 * meaningless autoincrement integer). See ../schema/generate.ts's
 * generateArrayTable `versioned` param doc comment for the confirmed shape.
 */
function createArrayOps(arrayTables: Record<string, AnySQLiteTable>, uuidColumn: boolean) {
  const arrayFieldNames = Object.keys(arrayTables)

  async function attachArrays<T extends Record<string, unknown>>(doc: T, ownerId: number): Promise<T> {
    if (!arrayFieldNames.length) return doc
    const db = await getDb()
    const withArrays = { ...doc } as Record<string, unknown>
    for (const name of arrayFieldNames) {
      const childTable = arrayTables[name]
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      const rows = await db.select().from(childTable).where(eq(childColumns.parentId, ownerId)).orderBy(childColumns.order)
      withArrays[name] = (rows as Record<string, unknown>[]).map((row) => {
        const { parentId: _parentId, order: _order, id: rawId, uuid, ...rest } = row as Record<string, unknown> & { uuid?: string }
        return { ...rest, id: uuidColumn ? uuid : rawId }
      })
    }
    return withArrays as T
  }

  async function writeArrays(ownerId: number, arrays: Record<string, unknown[]>): Promise<void> {
    if (!Object.keys(arrays).length) return
    const db = await getDb()
    for (const [name, items] of Object.entries(arrays)) {
      const childTable = arrayTables[name]
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      await db.delete(childTable).where(eq(childColumns.parentId, ownerId))
      if (items.length) {
        await db.insert(childTable).values(
          items.map((item, index) => {
            const { id: itemId, ...rest } = item as Record<string, unknown> & { id?: string }
            const row: Record<string, unknown> = { ...rest, order: index, parentId: ownerId }
            if (uuidColumn) {
              row.uuid = itemId || crypto.randomUUID()
            } else {
              row.id = itemId || crypto.randomUUID()
            }
            return row
          }),
        )
      }
    }
  }

  return { attachArrays, writeArrays }
}

/**
 * The blocks/hasMany-relationship read+write logic shared by createCollectionOps
 * (the live table) and createVersionsOps (the `_<table>_v` table) - both need
 * exactly the same "merge every block type's rows in `_order`, re-attach each
 * block's own hasMany subfields from the shared `_rels` table, replace
 * wholesale on write" behaviour, just scoped to a different owning row:
 * the live table scopes children by the live document's own id, the versions
 * table scopes them by the VERSION ROW's own id - confirmed against real
 * `_eg_pages_v_blocks_hero`/`_eg_pages_v_rels`, whose `_parent_id`/`parent_id`
 * FKs point at `_eg_pages_v` itself, not the live `eg_pages` table. Neither
 * caller needs to know that distinction - they just pass in `ownerId`.
 *
 * `uuidColumn` is the one real shape difference: a live block/rels-adjacent
 * table's row identity is its own `id` column (a string, explicitly set on
 * insert - it is not autoincrement), where a VERSIONED block table's row
 * identity is its `_uuid` column instead (its own `id` is a meaningless
 * autoincrement integer - never set on insert, never read back). See
 * ../schema/generate.ts's generateBlockTables `versioned` param doc comment
 * for the confirmed real DDL this mirrors.
 */
function createBlocksRelsOps(
  relsTable: RelsTableDef | undefined,
  topLevelRelsFieldTargets: Record<string, string>,
  blocksFields: Record<string, { blockTypes: Record<string, BlockTypeDef> }>,
  uuidColumn: boolean,
  // Every `path` value (both a block row's own `_path` column and a nested
  // hasMany subfield's `path` in `relsTable`) gets this prepended - confirmed
  // against real data: a live block's `_path` is just "blocks", but a
  // VERSIONED block's is "version.blocks" (dot, not underscore - distinct
  // from the "version_" underscore prefix generateVersionsTable's columns
  // get), and a versioned block's nested hasMany subfield writes to
  // `_rels` with `path` = "version.blocks.<index>.<field>", not
  // "blocks.<index>.<field>". Payload's own engine.create() produced both of
  // these; this is not guessed.
  pathPrefix = '',
) {
  const relsColumns = relsTable ? (relsTable.table as unknown as Record<string, SQLiteColumn>) : undefined
  const topLevelRelsFieldNames = Object.keys(topLevelRelsFieldTargets)
  const blocksFieldNames = Object.keys(blocksFields)

  function relsColumnFor(targetSlug: string): string {
    if (!relsTable) {
      throw new Error(`createBlocksRelsOps: a relsField targets "${targetSlug}" but no relsTable was given.`)
    }
    const columnKey = relsTable.targetColumns[targetSlug]
    if (!columnKey) {
      throw new Error(`createBlocksRelsOps: relsTable has no column for target collection "${targetSlug}" - check generateRelsTable's inputs.`)
    }
    return columnKey
  }

  /** Reads one hasMany/polymorphic field's related ids, ordered - shared by top-level fields (`path` = field name) and blocks-nested ones (`path` = `<blocksField>.<index>.<field>`). */
  async function readRelsIds(ownerId: number, path: string, targetColumnKey: string): Promise<number[]> {
    if (!relsTable || !relsColumns) return []
    const db = await getDb()
    const rows = await db
      .select()
      .from(relsTable.table)
      .where(and(eq(relsColumns.parentId, ownerId), eq(relsColumns.path, path)))
      .orderBy(relsColumns.order)
    return (rows as Record<string, unknown>[]).map((row) => row[targetColumnKey] as number).filter((value) => value != null)
  }

  /** Replaces one hasMany/polymorphic field's related ids wholesale - delete every row at this exact path, then reinsert in order (1-based, matching the real `eg_page_templates_rels`/`eg_faq_settings_rels` data - confirmed by inspection, not guessed). */
  async function writeRelsIds(ownerId: number, path: string, targetColumnKey: string, ids: number[]): Promise<void> {
    if (!relsTable || !relsColumns) return
    const db = await getDb()
    await db.delete(relsTable.table).where(and(eq(relsColumns.parentId, ownerId), eq(relsColumns.path, path)))
    if (ids.length) {
      await db.insert(relsTable.table).values(ids.map((relId, index) => ({ parentId: ownerId, path, order: index + 1, [targetColumnKey]: relId })))
    }
  }

  async function attachTopLevelRels<T extends Record<string, unknown>>(doc: T, ownerId: number): Promise<T> {
    if (!topLevelRelsFieldNames.length) return doc
    const withRels = { ...doc } as Record<string, unknown>
    for (const [fieldName, targetSlug] of Object.entries(topLevelRelsFieldTargets)) {
      withRels[fieldName] = await readRelsIds(ownerId, `${pathPrefix}${fieldName}`, relsColumnFor(targetSlug))
    }
    return withRels as T
  }

  async function writeTopLevelRels(ownerId: number, topLevelRels: Record<string, number[]>): Promise<void> {
    for (const [fieldName, ids] of Object.entries(topLevelRels)) {
      const targetSlug = topLevelRelsFieldTargets[fieldName]
      await writeRelsIds(ownerId, `${pathPrefix}${fieldName}`, relsColumnFor(targetSlug), ids)
    }
  }

  /** Reconstructs every `blocks` field on a document - merges each block type's own child-table rows into one array ordered by the shared `_order` sequence, then re-attaches each block's own hasMany subfields from `relsTable`. */
  async function attachBlocksFields<T extends Record<string, unknown>>(doc: T, ownerId: number): Promise<T> {
    if (!blocksFieldNames.length) return doc
    const db = await getDb()
    const withBlocks = { ...doc } as Record<string, unknown>

    for (const [fieldName, { blockTypes }] of Object.entries(blocksFields)) {
      const perType: { slug: string; row: Record<string, unknown> }[] = []
      for (const [slug, def] of Object.entries(blockTypes)) {
        const blockColumns = def.table as unknown as Record<string, SQLiteColumn>
        const rows = await db.select().from(def.table).where(eq(blockColumns.parentId, ownerId)).orderBy(blockColumns.order)
        for (const row of rows as Record<string, unknown>[]) perType.push({ slug, row })
      }
      perType.sort((a, b) => (a.row.order as number) - (b.row.order as number))

      withBlocks[fieldName] = await Promise.all(
        perType.map(async ({ slug, row }, index) => {
          const { order: _order, parentId: _parentId, path: _path, id: rawId, uuid, ...rest } = row as Record<string, unknown> & { uuid?: string }
          const def = blockTypes[slug]
          for (const [subFieldName, targetSlug] of Object.entries(def.relsFieldTargets)) {
            rest[subFieldName] = await readRelsIds(ownerId, `${pathPrefix}${fieldName}.${index}.${subFieldName}`, relsColumnFor(targetSlug))
          }
          return { ...rest, id: uuidColumn ? uuid : rawId, blockType: slug }
        }),
      )
    }
    return withBlocks as T
  }

  /** Replaces every `blocks` field's rows (and their nested rels rows) wholesale, same approach as writeArrays/writeRelsIds. */
  async function writeBlocksFields(ownerId: number, blocks: Record<string, Record<string, unknown>[]>): Promise<void> {
    if (!Object.keys(blocks).length) return
    const db = await getDb()

    for (const [fieldName, items] of Object.entries(blocks)) {
      const { blockTypes } = blocksFields[fieldName]

      for (const def of Object.values(blockTypes)) {
        const blockColumns = def.table as unknown as Record<string, SQLiteColumn>
        await db.delete(def.table).where(eq(blockColumns.parentId, ownerId))
      }
      if (relsTable && relsColumns) {
        await db.delete(relsTable.table).where(and(eq(relsColumns.parentId, ownerId), like(relsColumns.path, `${pathPrefix}${fieldName}.%`)))
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

        const row: Record<string, unknown> = {
          ...scalars,
          order: index + 1,
          parentId: ownerId,
          path: `${pathPrefix}${fieldName}`,
          blockName: blockName ?? null,
        }
        if (uuidColumn) {
          row.uuid = (itemId as string) || crypto.randomUUID()
        } else {
          row.id = (itemId as string) || crypto.randomUUID()
        }
        if (!rowsByType.has(blockType)) rowsByType.set(blockType, [])
        rowsByType.get(blockType)!.push(row)

        for (const [subFieldName, targetSlug] of Object.entries(def.relsFieldTargets)) {
          const ids = (fields[subFieldName] as number[]) ?? []
          if (ids.length) {
            await db.insert(relsTable!.table).values(
              ids.map((relId, relIndex) => ({
                parentId: ownerId,
                path: `${pathPrefix}${fieldName}.${index}.${subFieldName}`,
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

  return { attachTopLevelRels, writeTopLevelRels, attachBlocksFields, writeBlocksFields }
}

/**
 * Read/write for the parallel `_<table>_v` versions table generateVersionsTable
 * produces. `array` and `blocks` fields, and blocks' nested hasMany/polymorphic
 * subfields, ARE supported here (pass the versioned `arrayTables`/`relsTable`/
 * `blocksFields` - e.g. postsVersionsCategories/postsVersionsRels/
 * postsVersionsBlockTypes - same shapes createCollectionOps takes, just
 * generated against the versions table instead of the live one), scoped by
 * the version row's OWN id via createArrayOps/createBlocksRelsOps - see
 * their doc comments. Still narrow on one thing: top-level (not
 * blocks-nested) hasMany fields at the version level (nothing has needed one
 * yet - every hasMany/polymorphic field in this app's versioned collections
 * lives inside a block).
 *
 * Not folded into createCollectionOps' create/updateByID: whether every live
 * write should also create a version row, and how `_status`/`latest`/
 * draft-vs-published reads should behave, is an application/Payload-level
 * policy question this data layer does not need to settle to prove the
 * schema and the basic row shape are right - see ../index.ts.
 */
export function createVersionsOps(
  table: AnySQLiteTable,
  groupFields: GroupFieldMeta[] = [],
  rels: {
    arrayTables?: Record<string, AnySQLiteTable>
    relsTable?: RelsTableDef
    blocksFields?: Record<string, { blockTypes: Record<string, BlockTypeDef> }>
  } = {},
) {
  const columns = table as unknown as Record<string, SQLiteColumn>
  const { arrayTables = {}, relsTable, blocksFields = {} } = rels
  const arrayFieldNames = Object.keys(arrayTables)
  const blocksFieldNames = Object.keys(blocksFields)
  const { attachArrays, writeArrays } = createArrayOps(arrayTables, true)
  // "version." (dot), not "version_" (underscore) - see createBlocksRelsOps'
  // pathPrefix doc comment; confirmed against real _eg_pages_v_rels data.
  const { attachBlocksFields, writeBlocksFields } = createBlocksRelsOps(relsTable, {}, blocksFields, true, 'version.')

  async function attachExtras(row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const withArrays = await attachArrays(row, row.id as number)
    const withBlocks = await attachBlocksFields(withArrays, row.id as number)
    return nestGroups(withBlocks, groupFields)
  }

  async function findLatestByParentID(parentId: number): Promise<Record<string, unknown> | null> {
    const db = await getDb()
    const [row] = await db.select().from(table).where(eq(columns.parentId, parentId)).orderBy(desc(columns.id)).limit(1)
    return row ? attachExtras(row as Record<string, unknown>) : null
  }

  async function findAllByParentID(parentId: number): Promise<Record<string, unknown>[]> {
    const db = await getDb()
    const rows = await db.select().from(table).where(eq(columns.parentId, parentId)).orderBy(desc(columns.id))
    return Promise.all(rows.map((row) => attachExtras(row as Record<string, unknown>)))
  }

  async function createVersion(parentId: number, data: Record<string, unknown>, opts: { latest?: boolean } = {}): Promise<Record<string, unknown>> {
    const db = await getDb()
    const now = new Date().toISOString()
    const { scalars, arrays, blocks } = splitVersionFields(data, arrayFieldNames, blocksFieldNames)
    const values = { ...flattenGroups(scalars, groupFields), parentId, createdAt: now, updatedAt: now, latest: opts.latest ?? true }
    const [row] = await db.insert(table).values(values).returning()
    const id = (row as { id: number }).id
    await writeArrays(id, arrays)
    await writeBlocksFields(id, blocks)
    return attachExtras(row as Record<string, unknown>)
  }

  return { findLatestByParentID, findAllByParentID, createVersion }
}

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
    groupFields?: GroupFieldMeta[]
  } = {},
) {
  const columns = table as unknown as Record<string, SQLiteColumn>
  const idColumn = columns.id
  const arrayFieldNames = Object.keys(arrayTables)

  const { relsTable, topLevelRelsFieldTargets = {}, blocksFields = {}, groupFields = [] } = rels
  const topLevelRelsFieldNames = Object.keys(topLevelRelsFieldTargets)
  const blocksFieldNames = Object.keys(blocksFields)
  const blocksRelsOps = createBlocksRelsOps(relsTable, topLevelRelsFieldTargets, blocksFields, false)
  const { attachArrays, writeArrays } = createArrayOps(arrayTables, false)

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

  async function attachExtras(doc: Doc): Promise<Doc> {
    const withArrays = await attachArrays(doc, doc.id)
    const withRels = await blocksRelsOps.attachTopLevelRels(withArrays, doc.id)
    const withBlocks = await blocksRelsOps.attachBlocksFields(withRels, doc.id)
    return nestGroups(withBlocks, groupFields) as Doc
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
    const values = { ...defaults, ...flattenGroups(scalars, groupFields), updatedAt: now, createdAt: now }
    const [row] = await db.insert(table).values(values).returning()
    const id = (row as Doc).id
    await writeArrays(id, arrays)
    await blocksRelsOps.writeTopLevelRels(id, topLevelRels)
    await blocksRelsOps.writeBlocksFields(id, blocks)
    return attachExtras(row as Doc)
  }

  async function updateByID(id: number, data: Record<string, unknown>): Promise<Doc | null> {
    const db = await getDb()
    const { scalars, arrays, topLevelRels, blocks } = splitSpecialFields(data)
    const [row] = await db
      .update(table)
      .set({ ...flattenGroups(scalars, groupFields), updatedAt: new Date().toISOString() })
      .where(eq(idColumn, id))
      .returning()
    if (!row) return null
    await writeArrays(id, arrays)
    await blocksRelsOps.writeTopLevelRels(id, topLevelRels)
    await blocksRelsOps.writeBlocksFields(id, blocks)
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
