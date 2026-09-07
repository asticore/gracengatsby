import type { CollectionConfig, Where } from '@/engine'

import { and, asc, desc, eq, like, sql } from 'drizzle-orm'
import type { AnySQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core'

import { capitalize, type GroupFieldMeta } from './schema/generate'
import { getDb } from './connect'
import { buildWhere } from './where'

export type Doc = Record<string, unknown> & { id: number }

/** One child table per block type, keyed by block slug - what generateBlockTables produces for a single `blocks` field. */
export type BlockTypeDef = { table: AnySQLiteTable; relsFieldTargets: Record<string, string> }

/** The shared `_rels` table for a parent table - what generateRelsTable produces. */
export type RelsTableDef = { table: AnySQLiteTable; targetColumns: Record<string, string> }

/** One array field nested inside another array's own subfields (or one of its groups) - what generateArrayTable's own `nestedArrayFields` entries become once a collection's ops file packages them for createArrayOps. `groupName` is set when the nested array lives inside one of the parent array's groups (Forms' `conditional.rules`) rather than directly in the array's own subfields (FieldGroups'/Forms' `options`) - see createArrayOps' attachArrays/writeArrays for how that changes where the reconstructed array ends up in the document shape. */
export type NestedArrayTableDef = { table: AnySQLiteTable; groupName?: string }

/** An array field's full definition for createArrayOps/createCollectionOps - a superset of the bare table every array field used before Phase 17 needed. `groupFields` is this array's OWN groupFields (a group flattened onto the array's own child table, e.g. Forms' `calculation`/`pricing`/`conditional`); `nestedArrayTables` is keyed by the nested field's own name (e.g. "options", "rules"). See ../schema/generate.ts's generateArrayTable doc comment for the confirmed real shapes this mirrors. */
export type ArrayFieldDef = { table: AnySQLiteTable; groupFields?: GroupFieldMeta[]; nestedArrayTables?: Record<string, NestedArrayTableDef> }

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
  for (const { name, subFieldNames, arrayFieldNames } of groupFields) {
    const group: Record<string, unknown> = {}
    for (const subName of subFieldNames) {
      const jsKey = `${name}${capitalize(subName)}`
      group[subName] = result[jsKey]
      delete result[jsKey]
    }
    // A group living inside an array's own subfields (Forms' `conditional`)
    // can itself contain an array (`rules`) - createArrayOps' attachArrays
    // pre-attaches that nested array's already-reconstructed rows onto this
    // same `${name}${capitalize(arrayName)}` synthetic key before calling
    // nestGroups, precisely so this loop can fold it in exactly like a
    // scalar subfield - see GroupFieldMeta's doc comment.
    for (const arrayName of arrayFieldNames ?? []) {
      const jsKey = `${name}${capitalize(arrayName)}`
      group[arrayName] = result[jsKey]
      delete result[jsKey]
    }
    result[name] = group
  }
  return result
}

/** The reverse of nestGroups - flattens a document's nested group objects back into the prefixed JS keys the drizzle table actually has, for insert/update. Only ever called on the REMAINING scalar columns of a row that has already had any nested array fields (including one living inside a group - see createArrayOps) pulled out separately, so it only ever reads `subFieldNames`, never `arrayFieldNames` - an array field has no flat column of its own to flatten into. */
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
 *
 * An entry in `arrayTables` may be a bare drizzle table (every array field
 * modeled before Phase 17 - Users' `roles`-shaped siblings aside, none of
 * them needed anything more) or an ArrayFieldDef carrying this array's own
 * `groupFields` (a group flattened onto the array's own child table, e.g.
 * Forms' `calculation`/`pricing`/`conditional`) and/or `nestedArrayTables`
 * (an array nested INSIDE this array's own subfields or one of its groups,
 * e.g. FieldGroups'/Forms' `options`, Forms' `conditional.rules`) - see
 * ../schema/generate.ts's generateArrayTable/generateNestedArrayTable doc
 * comments for the confirmed real shapes. Never mixed with `uuidColumn: true`
 * - nothing in this app's versioned collections needs either yet, and
 * generateArrayTable itself throws before producing one that would.
 */
function createArrayOps(arrayTables: Record<string, AnySQLiteTable | ArrayFieldDef>, uuidColumn: boolean) {
  const arrayFieldNames = Object.keys(arrayTables)

  function defFor(name: string): ArrayFieldDef {
    const value = arrayTables[name]
    return value && typeof value === 'object' && 'table' in value ? (value as ArrayFieldDef) : { table: value as AnySQLiteTable }
  }

  async function attachArrays<T extends Record<string, unknown>>(doc: T, ownerId: number): Promise<T> {
    if (!arrayFieldNames.length) return doc
    const db = await getDb()
    const withArrays = { ...doc } as Record<string, unknown>
    for (const name of arrayFieldNames) {
      const { table: childTable, groupFields = [], nestedArrayTables } = defFor(name)
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      const rows = await db.select().from(childTable).where(eq(childColumns.parentId, ownerId)).orderBy(childColumns.order)
      withArrays[name] = await Promise.all(
        (rows as Record<string, unknown>[]).map(async (row) => {
          const { parentId: _parentId, order: _order, id: rawId, uuid, ...rest } = row as Record<string, unknown> & { uuid?: string }
          const rowId = uuidColumn ? uuid : (rawId as string)
          const withNested = { ...rest } as Record<string, unknown>
          if (nestedArrayTables) {
            // A nested array's `_parent_id` is TEXT, referencing THIS row's
            // own string id - always `rawId` here, never the versioned
            // `uuid` column: nested arrays only ever exist on a live
            // (non-versioned) array table - see generateArrayTable's doc
            // comment.
            for (const [nestedName, { table: nestedTable, groupName }] of Object.entries(nestedArrayTables)) {
              const nestedColumns = nestedTable as unknown as Record<string, SQLiteColumn>
              const nestedRows = await db
                .select()
                .from(nestedTable)
                .where(eq(nestedColumns.parentId, rawId))
                .orderBy(nestedColumns.order)
              const nestedItems = (nestedRows as Record<string, unknown>[]).map((nestedRow) => {
                const { parentId: _np, order: _no, id: nestedId, ...nestedRest } = nestedRow
                return { ...nestedRest, id: nestedId }
              })
              // Placed under the same `${groupName}${capitalize(nestedName)}`
              // key nestGroups expects for a group's own arrayFieldNames -
              // ungrouped (groupName undefined), it lands under the bare
              // field name instead, which nestGroups leaves untouched since
              // no groupFields entry claims it.
              withNested[groupName ? `${groupName}${capitalize(nestedName)}` : nestedName] = nestedItems
            }
          }
          return { ...nestGroups(withNested, groupFields), id: rowId }
        }),
      )
    }
    return withArrays as T
  }

  async function writeArrays(ownerId: number, arrays: Record<string, unknown[]>): Promise<void> {
    if (!Object.keys(arrays).length) return
    const db = await getDb()
    for (const [name, items] of Object.entries(arrays)) {
      const { table: childTable, groupFields = [], nestedArrayTables } = defFor(name)
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      await db.delete(childTable).where(eq(childColumns.parentId, ownerId))
      if (!items.length) continue

      // Each row's own id is always known BEFORE insert (explicitly set, or
      // generated here) - unlike an autoincrement id, this lets a nested
      // array's rows be built up front too, keyed by the same id their
      // parent row is about to be inserted with.
      const nestedInserts: Record<string, { parentRowId: string; order: number; row: Record<string, unknown> }[]> = {}
      const rows = items.map((item, index) => {
        const { id: itemId, ...rest } = item as Record<string, unknown> & { id?: string }
        const rowId = (itemId as string) || crypto.randomUUID()
        const flat: Record<string, unknown> = { ...rest }

        if (nestedArrayTables) {
          for (const [nestedName, { groupName }] of Object.entries(nestedArrayTables)) {
            let nestedItems: unknown[] | undefined
            if (groupName) {
              const groupValue = flat[groupName] as Record<string, unknown> | undefined
              nestedItems = groupValue ? (groupValue[nestedName] as unknown[] | undefined) : undefined
            } else {
              nestedItems = flat[nestedName] as unknown[] | undefined
              delete flat[nestedName]
            }
            if (!nestedItems) continue
            if (!nestedInserts[nestedName]) nestedInserts[nestedName] = []
            nestedItems.forEach((nestedItem, nestedOrder) => {
              const { id: nestedId, ...nestedRest } = nestedItem as Record<string, unknown> & { id?: string }
              nestedInserts[nestedName].push({
                parentRowId: rowId,
                order: nestedOrder,
                row: { ...nestedRest, id: (nestedId as string) || crypto.randomUUID() },
              })
            })
          }
        }

        const row: Record<string, unknown> = { ...flattenGroups(flat, groupFields), order: index, parentId: ownerId }
        if (uuidColumn) {
          row.uuid = rowId
        } else {
          row.id = rowId
        }
        return row
      })
      await db.insert(childTable).values(rows)

      if (nestedArrayTables) {
        for (const [nestedName, { table: nestedTable }] of Object.entries(nestedArrayTables)) {
          const entries = nestedInserts[nestedName]
          if (!entries?.length) continue
          await db.insert(nestedTable).values(entries.map(({ parentRowId, order, row }) => ({ ...row, order, parentId: parentRowId })))
        }
      }
    }
  }

  return { attachArrays, writeArrays }
}

/**
 * The hasMany-`select` field read+write logic - Users' `roles` is this app's
 * only field of this kind. Confirmed against the real eg_users_roles table:
 * unlike an array field's child table (createArrayOps), its row-order/
 * parent-FK columns carry NO underscore prefix (`order`, `parent_id`, not
 * `_order`, `_parent_id`), and there is a single nullable `value` text
 * column holding each selected option's stored value - so unlike
 * createArrayOps, the document shape reconstructed here is a bare array of
 * strings (e.g. `doc.roles = ['admin', 'customer']`), not an array of
 * `{ ...subfields }` objects. See ../schema/generate.ts's
 * generateSelectHasManyTable doc comment for the confirmed table shape.
 */
function createSelectHasManyOps(selectTables: Record<string, AnySQLiteTable>) {
  const fieldNames = Object.keys(selectTables)

  async function attachSelects<T extends Record<string, unknown>>(doc: T, ownerId: number): Promise<T> {
    if (!fieldNames.length) return doc
    const db = await getDb()
    const withSelects = { ...doc } as Record<string, unknown>
    for (const name of fieldNames) {
      const childTable = selectTables[name]
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      const rows = await db.select().from(childTable).where(eq(childColumns.parentId, ownerId)).orderBy(childColumns.order)
      withSelects[name] = (rows as Record<string, unknown>[]).map((row) => row.value)
    }
    return withSelects as T
  }

  async function writeSelects(ownerId: number, selects: Record<string, unknown[]>): Promise<void> {
    if (!Object.keys(selects).length) return
    const db = await getDb()
    for (const [name, values] of Object.entries(selects)) {
      const childTable = selectTables[name]
      const childColumns = childTable as unknown as Record<string, SQLiteColumn>
      await db.delete(childTable).where(eq(childColumns.parentId, ownerId))
      if (values.length) {
        await db.insert(childTable).values(values.map((value, index) => ({ order: index, parentId: ownerId, value })))
      }
    }
  }

  return { attachSelects, writeSelects }
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
 * Query-time resolution for `join` fields - the last schema-generation gap
 * (see ../schema/generate.ts's processFields doc comment: a join field never
 * gets a column of its own). Read-only by construction: Payload itself never
 * accepts a write through a join field, it is always resolved by querying
 * the OTHER side's own relationship/hasMany field.
 *
 * Confirmed against a real Events document's `rsvps` field (Events' only
 * join field, targeting EventRSVPs' `event` relationship column) by creating
 * documents through Payload's own engine and inspecting its actual
 * `findByID` response, not guessed:
 *
 *   { docs: [13, 12, 11, ...], hasNextPage: true }
 *
 * - a plain array of related ids (this data layer never resolves nested
 * related documents for ANY relationship field, join or otherwise - see
 * createBlocksRelsOps/createArrayOps, both of which also return bare ids -
 * so a join field fits that same convention rather than introducing a
 * depth concept nothing else here has) plus a `hasNextPage` flag. Confirmed
 * default paging: sorted by id descending (newest related row first - same
 * order `-createdAt` would give, since insertion order and id both increase
 * together), limit 10, `hasNextPage` true once an 11th matching row exists -
 * confirmed against Events' `rsvps`, whose join field declares no
 * `defaultSort` of its own.
 *
 * Courses' `lessons` join (Phase 10) revealed that default isn't the whole
 * story: its join field DOES declare its own `defaultSort: 'order'` (see
 * src/features/courses/collections/Courses.ts), and real Payload honors
 * that instead of the id-descending default - confirmed by creating 11 real
 * Lessons out of id order relative to their `order` values and inspecting
 * Payload's own `findByID` response: it came back sorted by `order`
 * ascending, not by id at all. So each join field now carries its own
 * optional `sort` (column + direction), read off the field's own
 * `defaultSort` string in ../schema/index.ts (a bare name = ascending, a
 * `-`-prefixed name = descending, matching Payload's own `sort` string
 * convention) - falling back to `{ column: 'id', direction: 'desc' }` when a
 * join field declares no `defaultSort`, exactly reproducing the previously-
 * confirmed Events behaviour. Payload's real page/where query options on a
 * join field are still not implemented - nothing in this app's admin UI or
 * API usage needs them yet.
 */
function createJoinOps(joinFields: Record<string, { table: AnySQLiteTable; onColumn: string; sort?: { column: string; direction: 'asc' | 'desc' } }>) {
  const joinFieldNames = Object.keys(joinFields)
  const JOIN_LIMIT = 10

  async function attachJoins<T extends Record<string, unknown>>(doc: T, ownerId: number): Promise<T> {
    if (!joinFieldNames.length) return doc
    const db = await getDb()
    const withJoins = { ...doc } as Record<string, unknown>
    for (const name of joinFieldNames) {
      const { table, onColumn, sort = { column: 'id', direction: 'desc' } } = joinFields[name]
      const childColumns = table as unknown as Record<string, SQLiteColumn>
      const sortColumn = childColumns[sort.column]
      const rows = await db
        .select({ id: childColumns.id })
        .from(table)
        .where(eq(childColumns[onColumn], ownerId))
        .orderBy(sort.direction === 'asc' ? asc(sortColumn) : desc(sortColumn))
        .limit(JOIN_LIMIT + 1)
      const ids = (rows as { id: number }[]).map((row) => row.id)
      withJoins[name] = { docs: ids.slice(0, JOIN_LIMIT), hasNextPage: ids.length > JOIN_LIMIT }
    }
    return withJoins as T
  }

  return { attachJoins }
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
    // Filter on `latest` itself, not just `order by id desc limit 1` - real
    // Payload's own draft-resolution read does the same (confirmed: it does
    // NOT fall back to version row insertion order/timestamp when
    // `latest` disagrees with it - see createDraftOps' doc comment for how
    // that was found). `latest` is exclusive per parent by construction (see
    // createVersion below), so this is normally a single row; `orderBy(desc(id))`
    // is just a tie-break if that invariant were ever violated.
    const [row] = await db
      .select()
      .from(table)
      .where(and(eq(columns.parentId, parentId), eq(columns.latest, true)))
      .orderBy(desc(columns.id))
      .limit(1)
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
    const latest = opts.latest ?? true
    // `latest` is exclusive per parent - confirmed against real Payload data
    // (create a doc, save a draft, publish it, save another draft: at every
    // step exactly one _eg_events_v row for that parent has latest=1, the
    // previous one flips to 0 the moment a new one becomes latest). Only
    // flip the others when THIS row is becoming latest - an explicit
    // `latest: false` call (nothing here makes one yet) shouldn't disturb
    // whatever the real latest version currently is.
    if (latest) {
      await db.update(table).set({ latest: false }).where(eq(columns.parentId, parentId))
    }
    const { scalars, arrays, blocks } = splitVersionFields(data, arrayFieldNames, blocksFieldNames)
    const values = { ...flattenGroups(scalars, groupFields), parentId, createdAt: now, updatedAt: now, latest }
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
 * `joinFields` (join field name -> the related collection's own table plus
 * the name of ITS relationship/hasMany column pointing back here) is
 * resolved read-only at query time via createJoinOps - see its doc comment
 * for the confirmed `{ docs: [...], hasNextPage }` shape and paging default.
 *
 * `selectTables` (field name -> child table, from generateSelectHasManyTable)
 * is the same idea as `arrayTables` for a hasMany `select` field (Users'
 * `roles` is this app's only one) - see createSelectHasManyOps' doc comment
 * for the one real shape difference (no underscore-prefixed order/parent
 * columns, and a bare string per row instead of a subfield object).
 *
 * Static `defaultValue`s from the collection config are applied on create
 * when the caller omits that field, matching what Payload's own validation
 * layer does before it ever reaches the database adapter - a function
 * default (a per-request computed value) is a Payload-level concern, not the
 * database's, so those are left for the caller to resolve first. Merged into
 * `data` before splitSpecialFields runs, not into the flat insert `values`
 * afterward - a default targeting a special (array/rels/blocks/select) field,
 * like Users' `roles: ['customer']`, has to go through the exact same
 * split/write path any other value for that field does.
 */
export function createCollectionOps(
  table: AnySQLiteTable,
  collection: CollectionConfig,
  arrayTables: Record<string, AnySQLiteTable | ArrayFieldDef> = {},
  rels: {
    relsTable?: RelsTableDef
    topLevelRelsFieldTargets?: Record<string, string>
    blocksFields?: Record<string, { blockTypes: Record<string, BlockTypeDef> }>
    groupFields?: GroupFieldMeta[]
    joinFields?: Record<string, { table: AnySQLiteTable; onColumn: string; sort?: { column: string; direction: 'asc' | 'desc' } }>
    selectTables?: Record<string, AnySQLiteTable>
  } = {},
) {
  const columns = table as unknown as Record<string, SQLiteColumn>
  const idColumn = columns.id
  const arrayFieldNames = Object.keys(arrayTables)

  const { relsTable, topLevelRelsFieldTargets = {}, blocksFields = {}, groupFields = [], joinFields = {}, selectTables = {} } = rels
  const topLevelRelsFieldNames = Object.keys(topLevelRelsFieldTargets)
  const blocksFieldNames = Object.keys(blocksFields)
  const selectFieldNames = Object.keys(selectTables)
  const blocksRelsOps = createBlocksRelsOps(relsTable, topLevelRelsFieldTargets, blocksFields, false)
  const { attachArrays, writeArrays } = createArrayOps(arrayTables, false)
  const { attachJoins } = createJoinOps(joinFields)
  const { attachSelects, writeSelects } = createSelectHasManyOps(selectTables)

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
    const selects: Record<string, unknown[]> = {}
    for (const name of selectFieldNames) {
      if (name in scalars) {
        selects[name] = (scalars[name] as unknown[]) ?? []
        delete scalars[name]
      }
    }
    return { scalars, arrays, topLevelRels, blocks, selects }
  }

  async function attachExtras(doc: Doc): Promise<Doc> {
    const withArrays = await attachArrays(doc, doc.id)
    const withRels = await blocksRelsOps.attachTopLevelRels(withArrays, doc.id)
    const withBlocks = await blocksRelsOps.attachBlocksFields(withRels, doc.id)
    const withJoins = await attachJoins(withBlocks, doc.id)
    const withSelects = await attachSelects(withJoins, doc.id)
    return nestGroups(withSelects, groupFields) as Doc
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
    // Defaults are merged into `data` BEFORE splitting, not into the flat
    // insert `values` after - Users' `roles` (defaultValue: ['customer']) is
    // a hasMany select, a special (child-table) field, not a plain column,
    // and would fail the insert entirely if a default for it ever landed in
    // `values` instead of going through splitSpecialFields/writeSelects like
    // any other roles value does. Every existing plain-column defaultValue in
    // this app behaves identically either way, so this is not a behaviour
    // change for them - only a correctness fix for a special-field default,
    // which nothing exercised before Users.
    const { scalars, arrays, topLevelRels, blocks, selects } = splitSpecialFields({ ...defaults, ...data })
    const values = { ...flattenGroups(scalars, groupFields), updatedAt: now, createdAt: now }
    const [row] = await db.insert(table).values(values).returning()
    const id = (row as Doc).id
    await writeArrays(id, arrays)
    await blocksRelsOps.writeTopLevelRels(id, topLevelRels)
    await blocksRelsOps.writeBlocksFields(id, blocks)
    await writeSelects(id, selects)
    return attachExtras(row as Doc)
  }

  async function updateByID(id: number, data: Record<string, unknown>): Promise<Doc | null> {
    const db = await getDb()
    const { scalars, arrays, topLevelRels, blocks, selects } = splitSpecialFields(data)
    const [row] = await db
      .update(table)
      .set({ ...flattenGroups(scalars, groupFields), updatedAt: new Date().toISOString() })
      .where(eq(idColumn, id))
      .returning()
    if (!row) return null
    await writeArrays(id, arrays)
    await blocksRelsOps.writeTopLevelRels(id, topLevelRels)
    await blocksRelsOps.writeBlocksFields(id, blocks)
    await writeSelects(id, selects)
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

/**
 * The draft/publish application-level policy createCollectionOps and
 * createVersionsOps deliberately leave open (see createVersionsOps' doc
 * comment and ../index.ts) - composes the two rather than folding either
 * apart, so every non-drafts collection (Faqs, MembershipTiers,
 * PageTemplates, EventRSVPs) keeps using createCollectionOps exactly as
 * proven, untouched.
 *
 * Confirmed by creating/updating/publishing a real Events document through
 * Payload's own engine and inspecting exactly what it did to both eg_events
 * and _eg_events_v (see tests/int/cms-db-events-drafts.int.spec.ts) - not
 * guessed:
 *
 *  - `create()` always writes the live row (a document has to exist
 *    somewhere) AND a mirroring version row (latest: true). The live row's
 *    `_status` comes from the column's own SQL default ('draft') when the
 *    caller doesn't set one - exactly what Payload's create() does too.
 *  - `updateByID(id, data)` with no `draft` flag - a normal/"publish" write,
 *    whatever `_status` the caller passes - updates the live row (unchanged
 *    createCollectionOps behaviour) AND creates a new version row mirroring
 *    the fresh live state, becoming the new latest.
 *  - `updateByID(id, data, { draft: true })` - Payload's own "save as
 *    draft" - creates a new latest version row ONLY, snapshotting the full
 *    resulting document (existing live state merged with `data`, same
 *    partial-update semantics as a live updateByID). The live row is left
 *    completely untouched, not even `updatedAt` - confirmed empirically:
 *    publishing, then doing a draft:true edit, left eg_events exactly as the
 *    publish had it, while _eg_events_v gained one more latest:true row.
 *  - `findByID(id)` with no `draft` flag reads the live row (unchanged
 *    createCollectionOps behaviour) - whatever `_status` it currently holds
 *    (which can be 'draft', if the document has never been published).
 *  - `findByID(id, { draft: true })` reads the latest VERSION row instead
 *    (whatever was most recently saved, draft or published either way),
 *    reshaped into the same document shape a normal findByID returns.
 *
 * `omit` strips document keys that exist on the reconstructed Doc shape but
 * are never a real column (live OR versioned) - concretely, a `join` field
 * name (e.g. Events' `rsvps`): it gets attached onto every Doc
 * createCollectionOps returns, but createVersionsOps' own table has no
 * column for it (see createJoinOps' doc comment - joins never get a column,
 * live or versioned), so it must never be handed to createVersion. `id` is
 * always stripped too - it is the LIVE document's id, not the meaningless
 * value a version row's own (separate, autoincrement) `id` should take.
 *
 * NOT supported yet: `findMany` with a `draft` flag. Nothing in this app
 * queries a LIST of drafts today, and doing that right means a per-row
 * "latest version" subquery this data layer has no real case to prove
 * against yet - revisit if/when something needs it. A draft-mode
 * findByID/updateByID result also does not re-attach join fields (e.g.
 * `rsvps`) the way a live findByID does - narrower than the live shape,
 * documented rather than guessed at.
 */
export function createDraftOps(
  ops: ReturnType<typeof createCollectionOps>,
  versionsOps: ReturnType<typeof createVersionsOps>,
  opts: { omit?: string[] } = {},
) {
  const omit = new Set(['id', ...(opts.omit ?? [])])

  function forVersion(doc: Doc): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(doc)) {
      if (!omit.has(key)) result[key] = value
    }
    return result
  }

  /** A version row's own shape (its own `id`, `parentId`, `latest`, version timestamps) reshaped into the document shape a normal findByID/updateByID returns - the LIVE document's id, not the version row's. */
  function fromVersion(parentId: number, version: Record<string, unknown>): Doc {
    const { id: _versionId, parentId: _parentId, latest: _latest, versionCreatedAt: _vc, versionUpdatedAt: _vu, ...rest } = version
    return { ...rest, id: parentId } as Doc
  }

  async function create(data: Record<string, unknown>): Promise<Doc> {
    const created = await ops.create(data)
    await versionsOps.createVersion(created.id, forVersion(created), { latest: true })
    return created
  }

  async function updateByID(id: number, data: Record<string, unknown>, updateOpts: { draft?: boolean } = {}): Promise<Doc | null> {
    if (updateOpts.draft) {
      const current = await ops.findByID(id)
      if (!current) return null
      // A draft:true save defaults the new version's `_status` to 'draft'
      // even when the live doc it's layered on top of is 'published' -
      // confirmed against real Payload: `engine.update({..., draft: true})`
      // with no `_status` in `data` produced a version__status of 'draft',
      // not the live row's 'published'. An explicit `_status` in `data`
      // still wins (untested edge case upstream, but the obvious precedent).
      const merged = { ...current, _status: 'draft', ...data } as Doc
      const version = await versionsOps.createVersion(id, forVersion(merged), { latest: true })
      return fromVersion(id, version)
    }
    const updated = await ops.updateByID(id, data)
    if (!updated) return null
    await versionsOps.createVersion(id, forVersion(updated), { latest: true })
    return updated
  }

  async function findByID(id: number, findOpts: { draft?: boolean } = {}): Promise<Doc | null> {
    if (findOpts.draft) {
      const version = await versionsOps.findLatestByParentID(id)
      return version ? fromVersion(id, version) : ops.findByID(id)
    }
    return ops.findByID(id)
  }

  return { ...ops, create, updateByID, findByID }
}
