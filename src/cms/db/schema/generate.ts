import type { CollectionConfig, Field } from '@/engine'

import { integer, numeric, sqliteTable, text, type SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import toSnakeCase from 'to-snake-case'

type NamedField = Field & { name: string }

/**
 * Derives a drizzle table from a real Payload CollectionConfig - the
 * generalisation promised in ../index.ts, proven against real collections
 * instead of hand-copied tables.
 *
 * Deliberately narrow: throws on anything it does not yet model correctly,
 * rather than silently generating a wrong or partial column or table.
 * Supports:
 *
 *   text, textarea, email, date, select (single-value) -> text column
 *   richText, json                                     -> text column, JSON mode
 *   number                                              -> numeric column
 *   checkbox                                            -> integer column, boolean mode
 *   relationship, upload (single target, not hasMany)   -> integer `<name>_id` column
 *   row, collapsible                                    -> flattened, fields promoted onto this table
 *   array                                                -> a child table, see generateArrayTable
 *   blocks                                               -> one child table per block type, see generateBlockTables
 *   hasMany/polymorphic relationship or upload           -> bucketed as a relsField, see generateRelsTable
 *
 * NOT supported yet (throws): group, tabs, join, hasMany select, and
 * `timestamps: false` (every generated table gets updatedAt/createdAt). Each
 * needs different modelling and is a later phase - see ../index.ts.
 */
export function generateTable(collection: CollectionConfig) {
  if (typeof collection.dbName === 'function') {
    throw new Error(`generateTable(${collection.slug}): a function dbName is not supported yet.`)
  }
  const tableName = tableNameFor(collection)

  const { columns: fieldColumns, arrayFields, blocksFields, relsFields } = processFields(collection.slug, collection.fields)

  const columns: Record<string, SQLiteColumnBuilderBase> = {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...fieldColumns,
  }
  columns.updatedAt = text('updated_at').notNull()
  columns.createdAt = text('created_at').notNull()

  return { table: sqliteTable(tableName, columns), tableName, arrayFields, blocksFields, relsFields }
}

/** The table name Payload would use for a collection - `dbName` if set, else its slug, snake-cased. */
export function tableNameFor(collection: CollectionConfig): string {
  if (typeof collection.dbName === 'function') {
    throw new Error(`tableNameFor(${collection.slug}): a function dbName is not supported yet.`)
  }
  return collection.dbName || toSnakeCase(collection.slug)
}

/**
 * A child table for one array field - `_order` (position within the array),
 * `_parent_id` (FK to the owning row, cascading on delete at the D1 level -
 * confirmed against the real eg_membership_tiers_benefits table, which is
 * exactly this shape), a string `id` per array row, then the array's own
 * subfields as columns. One row per array item, not one row per document.
 */
export function generateArrayTable(collectionSlug: string, parentTableName: string, field: NamedField) {
  if (field.type !== 'array') {
    throw new Error(`generateArrayTable(${collectionSlug}): field "${field.name}" is not an array field.`)
  }
  const tableName = `${parentTableName}_${toSnakeCase(field.name)}`

  const columns: Record<string, SQLiteColumnBuilderBase> = {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id').notNull(),
    id: text('id').primaryKey(),
  }

  const subFields = (field as unknown as { fields: Field[] }).fields
  const { columns: subColumns, arrayFields, blocksFields, relsFields } = processFields(collectionSlug, subFields)
  if (arrayFields.length) {
    throw new Error(`generateArrayTable(${collectionSlug}): nested array "${arrayFields[0].name}" inside array "${field.name}" is not supported yet.`)
  }
  if (blocksFields.length) {
    throw new Error(`generateArrayTable(${collectionSlug}): blocks field "${blocksFields[0].name}" inside array "${field.name}" is not supported yet.`)
  }
  if (relsFields.length) {
    throw new Error(
      `generateArrayTable(${collectionSlug}): hasMany/polymorphic relationship "${relsFields[0].name}" inside array "${field.name}" is not supported yet.`,
    )
  }
  Object.assign(columns, subColumns)

  return sqliteTable(tableName, columns)
}

/**
 * One child table PER BLOCK TYPE for a `blocks` field - confirmed against the
 * real eg_page_templates_blocks_hero / eg_page_templates_blocks_faq tables,
 * not one shared table for every block type. Shaped like an array child table
 * (`_order`, `_parent_id` cascading on delete, a string `id` per row) plus
 * `_path` (the blocks field's own name - disambiguates which blocks field a
 * row belongs to, confirmed constant per field regardless of the row's
 * position) and an automatic `block_name` column (Payload's built-in
 * per-instance label, not part of the block's own declared `fields`).
 *
 * `_order` is sequential across ALL block types sharing this field, not
 * per-type - confirmed by creating a template with hero, faq, faq in that
 * order and seeing _order 1, 2, 3 land in their respective per-type tables.
 * ../generic.ts relies on this to reconstruct the mixed-type array in order.
 *
 * Any hasMany/polymorphic relationship or upload field inside a block is
 * bucketed into that block's own `relsFields` (returned per block) rather
 * than becoming a column - it is written into the PARENT collection's single
 * shared `_rels` table (see generateRelsTable), not a table of its own.
 * Confirmed against eg_page_templates_rels: a `faqs` field inside a `faq`
 * block writes rows there with `path` = `blocks.<index>.faqs`, where `<index>`
 * is the block's 0-based position in the merged, _order-sorted array - NOT
 * the same as its 1-based `_order` value, and NOT scoped to the block's own
 * table (there is no such thing as a block-level `_rels` table).
 */
export function generateBlockTables(collectionSlug: string, parentTableName: string, field: NamedField) {
  if (field.type !== 'blocks') {
    throw new Error(`generateBlockTables(${collectionSlug}): field "${field.name}" is not a blocks field.`)
  }
  const blockDefs = (field as unknown as { blocks: { slug: string; fields: Field[] }[] }).blocks

  return blockDefs.map((block) => {
    const tableName = `${parentTableName}_blocks_${toSnakeCase(block.slug)}`
    const { columns: fieldColumns, arrayFields, blocksFields, relsFields } = processFields(collectionSlug, block.fields)
    if (arrayFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): array field "${arrayFields[0].name}" inside block "${block.slug}" is not supported yet.`)
    }
    if (blocksFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): nested blocks field inside block "${block.slug}" is not supported yet.`)
    }

    const columns: Record<string, SQLiteColumnBuilderBase> = {
      order: integer('_order').notNull(),
      parentId: integer('_parent_id').notNull(),
      path: text('_path').notNull(),
      id: text('id').primaryKey(),
      ...fieldColumns,
      blockName: text('block_name'),
    }

    return { slug: block.slug, table: sqliteTable(tableName, columns), relsFields }
  })
}

/**
 * The ONE shared table, per parent table, that every hasMany/polymorphic
 * relationship or upload field on it writes into - confirmed against
 * eg_faq_settings_rels (a global's top-level hasMany fields) and
 * eg_page_templates_rels (a collection's blocks-nested hasMany fields, which
 * land in exactly the same table as a top-level one would, just with a
 * `blocks.<index>.` prefix on `path`). There is no per-field and no
 * per-block-type `_rels` table.
 *
 * Shape: `id` (autoincrement PK), `order` (nullable, 1-based position within
 * one field's own list of relations - confirmed distinct from array/block
 * `_order`, which is 0- or 1-based per THIS module's own choice, not
 * Payload's), `parent_id` (FK to the TOP-LEVEL parent row - always integer,
 * even for a relationship nested inside a block, because blocks never get
 * their own id space in this table), `path` (disambiguates which field a row
 * belongs to), and one nullable `<targetTable>_id` column per DISTINCT target
 * collection referenced by any relsField passed in - shared across every
 * field that happens to target the same collection, exactly like Payload's
 * own scheme.
 *
 * `resolveTargetTable` maps a relationTo slug to that collection's own table
 * name (its `tableNameFor`) - passed in rather than looked up here, because
 * this module does not import every collection config, only the ones a given
 * schema/index.ts entry actually needs.
 */
export function generateRelsTable(parentTableName: string, relsFields: NamedField[], resolveTargetTable: (slug: string) => string) {
  const targetColumns: Record<string, string> = {}
  const columns: Record<string, SQLiteColumnBuilderBase> = {
    id: integer('id').primaryKey({ autoIncrement: true }),
    order: integer('order'),
    parentId: integer('parent_id').notNull(),
    path: text('path').notNull(),
  }

  for (const field of relsFields) {
    for (const slug of relationTargetSlugs(field)) {
      if (targetColumns[slug]) continue
      const targetTable = resolveTargetTable(slug)
      const columnKey = `${targetTable}Id`
      columns[columnKey] = integer(`${targetTable}_id`)
      targetColumns[slug] = columnKey
    }
  }

  const tableName = `${parentTableName}_rels`
  return { table: sqliteTable(tableName, columns), tableName, targetColumns }
}

/** The collection slug(s) a relationship/upload field's `relationTo` names - plural because Payload allows a polymorphic array, even though nothing in this app uses one yet. */
export function relationTargetSlugs(field: NamedField): string[] {
  const relationTo = (field as { relationTo?: string | string[] }).relationTo
  if (!relationTo) {
    throw new Error(`relationTargetSlugs: field "${field.name}" has no relationTo.`)
  }
  return Array.isArray(relationTo) ? relationTo : [relationTo]
}

/** True for a relationship/upload field that cannot be a plain `<name>_id` column - hasMany (a list) or polymorphic (relationTo is an array) - and so must be bucketed into a shared `_rels` table instead. */
function isHasManyRelational(field: NamedField): boolean {
  if (field.type !== 'relationship' && field.type !== 'upload') return false
  const hasMany = 'hasMany' in field && field.hasMany === true
  const polymorphic = Array.isArray((field as { relationTo?: unknown }).relationTo)
  return hasMany || polymorphic
}

/**
 * Walks a field list (flattening row/collapsible wrappers) and buckets each
 * field into columns-to-generate, array fields, blocks fields, or
 * hasMany/polymorphic relational fields - the same triage generateTable,
 * generateArrayTable and generateBlockTables all need, factored out once.
 */
function processFields(collectionSlug: string, fields: Field[]) {
  const columns: Record<string, SQLiteColumnBuilderBase> = {}
  const arrayFields: NamedField[] = []
  const blocksFields: NamedField[] = []
  const relsFields: NamedField[] = []

  for (const field of walkFields(collectionSlug, fields)) {
    if (field.type === 'array') {
      arrayFields.push(field)
      continue
    }
    if (field.type === 'blocks') {
      blocksFields.push(field)
      continue
    }
    if (isHasManyRelational(field)) {
      relsFields.push(field)
      continue
    }
    columns[field.name] = columnFor(collectionSlug, field)
  }

  return { columns, arrayFields, blocksFields, relsFields }
}

/**
 * Flattens a field list: row and collapsible are pure layout in Payload's own
 * schema (their fields land directly on the parent table, confirmed against
 * eg_membership_tiers - its row-wrapped `name`/`active`/`price`/`interval`/
 * `trialDays` fields are plain columns, not a child table), so this recurses
 * into them rather than treating them as fields of their own. Anything else
 * without a top-level `name` is a wrapper type not supported yet.
 */
function* walkFields(collectionSlug: string, fields: Field[]): Generator<NamedField> {
  for (const field of fields) {
    const named = field as Field & { name?: string; fields?: Field[] }
    if (named.type === 'row' || named.type === 'collapsible') {
      yield* walkFields(collectionSlug, named.fields ?? [])
      continue
    }
    if (!named.name) {
      throw new Error(`generateTable(${collectionSlug}): field of type "${named.type}" has no top-level name and is not a supported layout wrapper.`)
    }
    // Payload's Field union has per-variant required props (e.g. collapsible's
    // `label`) that don't survive a plain narrowing cast once `name` is known
    // - not a real type mismatch, just TS being unable to prove it structurally.
    yield named as unknown as NamedField
  }
}

function columnFor(collectionSlug: string, field: NamedField): SQLiteColumnBuilderBase {
  const columnName = toSnakeCase(field.name)
  const required = 'required' in field && field.required === true

  // Typed loosely: text/numeric/integer each return a different concrete
  // builder subtype, and only the concrete subtype (not the shared
  // SQLiteColumnBuilderBase interface) exposes .notNull() - not worth fighting
  // drizzle's builder generics for code that is inherently dynamic already.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let column: any
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'date':
      column = text(columnName)
      break
    case 'select':
      if ('hasMany' in field && field.hasMany) {
        throw new Error(`generateTable(${collectionSlug}): select field "${field.name}" is hasMany - needs a child table, not supported yet.`)
      }
      column = text(columnName)
      break
    case 'richText':
    case 'json':
      column = text(columnName, { mode: 'json' })
      break
    case 'number':
      column = numeric(columnName, { mode: 'number' })
      break
    case 'checkbox':
      column = integer(columnName, { mode: 'boolean' })
      break
    case 'relationship':
    case 'upload':
      // isHasManyRelational() has already routed hasMany/polymorphic fields
      // to relsFields before this is ever called - only a single-target
      // relationship/upload reaches here, so it is always a plain FK column.
      column = integer(`${columnName}_id`)
      break
    default:
      throw new Error(`generateTable(${collectionSlug}): field type "${field.type}" is not supported yet.`)
  }

  return (required ? column.notNull() : column) as SQLiteColumnBuilderBase
}
