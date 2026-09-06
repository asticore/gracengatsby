import type { CollectionConfig, Field } from '@/engine'

import { integer, numeric, sqliteTable, text, type SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import toSnakeCase from 'to-snake-case'

type NamedField = Field & { name: string }

/** One `group` field's reconstruction metadata - see processFields' group handling and ../generic.ts's nestGroups/flattenGroups. */
export type GroupFieldMeta = { name: string; subFieldNames: string[] }

export function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value
}

/**
 * True when a collection has drafts enabled - the only versions shape this
 * app uses (confirmed by grep across src/collections and src/features: every
 * other collection is `versions: false`). Checked as a truthy value, not
 * `=== true`: every collection here is authored as `versions: { drafts: true }`,
 * but Payload's own config sanitisation (run once, by importing
 * @/engage.config, before anything reads these configs for real) normalises
 * that shorthand into a full DraftsConfig OBJECT in place on the very same
 * CollectionConfig object this module imports - so by the time a real test
 * or the real app reads it, `.versions.drafts` is an object, not `true`.
 * Confirmed by hitting this the hard way: a strict `=== true` check passed
 * against the raw unsanitised module but failed at runtime once
 * @/engage.config had run.
 */
export function hasDrafts(collection: CollectionConfig): boolean {
  return typeof collection.versions === 'object' && collection.versions !== null && Boolean(collection.versions.drafts)
}

/** The implicit `_status` column Payload adds to both the live and (double-prefixed) versions table whenever drafts are enabled - confirmed against the real eg_pages/eg_events (`_status`) and _eg_pages_v/_eg_events_v (`version__status`) columns; not declared in any collection's own `fields`. */
function statusColumn(dbNamePrefix: string) {
  return text(`${dbNamePrefix}_status`).default('draft')
}

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
 *   group                                                -> flattened onto this table too, but with the group's
 *                                                          name prefixed onto each column (`seo_meta_title`, not
 *                                                          `meta_title`) - confirmed against eg_pages/eg_events -
 *                                                          and reconstructed as a nested object in the document
 *                                                          shape, unlike row/collapsible which stay flat there too
 *   array                                                -> a child table, see generateArrayTable
 *   blocks                                               -> one child table per block type, see generateBlockTables
 *   hasMany/polymorphic relationship or upload           -> bucketed as a relsField, see generateRelsTable
 *   join                                                 -> skipped entirely, no column - Payload resolves it at
 *                                                          query time against the related collection, which this
 *                                                          module does not do yet (the "joins" phase - see ../index.ts)
 *
 * `versions: { drafts: true }` on the collection adds the implicit `_status`
 * column Payload adds itself (confirmed against eg_pages/eg_events - not a
 * declared field), and generateVersionsTable derives the parallel
 * `_<table>_v` table from the exact same field list.
 *
 * NOT supported yet (throws): tabs, hasMany select, group/array/blocks
 * nesting inside one another or inside a hasMany-relational field's own
 * fields, and `timestamps: false` (every generated table gets
 * updatedAt/createdAt). Each needs different modelling - see ../index.ts.
 */
export function generateTable(collection: CollectionConfig) {
  if (typeof collection.dbName === 'function') {
    throw new Error(`generateTable(${collection.slug}): a function dbName is not supported yet.`)
  }
  const tableName = tableNameFor(collection)
  // A draft save must be allowed to leave required fields empty, so Payload
  // never emits a SQL NOT NULL for `required` on a collection with drafts
  // enabled - confirmed by inspecting real DDL: eg_faqs.question (required,
  // no drafts) is NOT NULL, but eg_events.title / eg_events.start_date and
  // eg_pages.title (all required, both collections have drafts) are not.
  const suppressRequired = hasDrafts(collection)

  const { columns: fieldColumns, arrayFields, blocksFields, relsFields, groupFields } = processFields(collection.slug, collection.fields, '', suppressRequired)

  const columns: Record<string, SQLiteColumnBuilderBase> = {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...fieldColumns,
  }
  columns.updatedAt = text('updated_at').notNull()
  columns.createdAt = text('created_at').notNull()
  if (hasDrafts(collection)) {
    columns._status = statusColumn('')
  }

  return { table: sqliteTable(tableName, columns), tableName, arrayFields, blocksFields, relsFields, groupFields }
}

/**
 * The parallel `_<table>_v` table Payload creates for a collection with
 * `versions: { drafts: true }` - one row per saved version (not one row per
 * document), confirmed against the real _eg_pages_v/_eg_events_v tables:
 * every field the live table has gets a `version_`-prefixed column here (the
 * live doc's value AT THAT VERSION), plus this row's own bookkeeping
 * (`id`, `parent_id` - nullable, set null on the live doc's delete rather
 * than cascading - `created_at`/`updated_at` for when the version itself was
 * saved, and `latest`, a flag marking the current version for that parent).
 *
 * `blocks` fields ARE supported here (confirmed against real
 * `_eg_pages_v_blocks_hero`): the returned `blocksFields` is the same field
 * list generateTable's is, meant for generateBlockTables(..., versioned:
 * true) - see that function's doc comment for the versioned id-scheme
 * difference. Likewise `relsFields` feeds generateRelsTable exactly like the
 * live table does, just against this table's own name, producing e.g.
 * `_eg_pages_v_rels` - confirmed to have the exact same column shape as a
 * live `_rels` table.
 *
 * `array` fields ARE supported too (confirmed against real
 * `_eg_posts_v_version_categories`): the returned `arrayFields` feeds
 * generateArrayTable(..., versioned: true) - table name is
 * `<versionsTable>_version_<fieldName>`, i.e. the array's own field name
 * gets the "version_" prefix baked into the TABLE name (unlike blocks
 * tables, which never get that prefix at all - confirmed
 * `_eg_pages_v_blocks_hero` has no "version_" in it anywhere), while its
 * subfield COLUMNS do NOT get `version_`-prefixed - only the table name
 * does. See generateArrayTable's `versioned` param doc comment for the rest
 * of the shape difference (integer autoincrement `id` plus an extra
 * `_uuid` column, same scheme as versioned blocks).
 */
export function generateVersionsTable(collection: CollectionConfig, mainTableName: string) {
  if (!hasDrafts(collection)) {
    throw new Error(`generateVersionsTable(${collection.slug}): versions.drafts is not enabled on this collection - nothing to generate.`)
  }
  // Always suppressed here regardless: a version row is a draft snapshot by
  // definition, never subject to a live NOT NULL constraint even when the
  // collection's own live table happens to have one (it never does once
  // drafts are enabled - see generateTable - but this stays explicit rather
  // than relying on that).
  const { columns: fieldColumns, arrayFields, blocksFields, relsFields, groupFields } = processFields(collection.slug, collection.fields, 'version_', true)

  const tableName = `_${mainTableName}_v`
  const columns: Record<string, SQLiteColumnBuilderBase> = {
    id: integer('id').primaryKey({ autoIncrement: true }),
    parentId: integer('parent_id'),
    ...fieldColumns,
    versionUpdatedAt: text('version_updated_at'),
    versionCreatedAt: text('version_created_at'),
    _status: statusColumn('version_'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    latest: integer('latest', { mode: 'boolean' }),
  }

  return { table: sqliteTable(tableName, columns), tableName, arrayFields, blocksFields, relsFields, groupFields }
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
 *
 * `versioned` produces the versioned shape instead (pass the VERSIONS
 * table's own name as `parentTableName`): the table name gets a "version_"
 * infix before the field name - `<versionsTable>_version_<fieldName>`,
 * confirmed against real `_eg_posts_v_version_categories` - and the row
 * identity is an integer autoincrement `id` plus an extra `_uuid` text
 * column, instead of the live table's string `id`, the same scheme
 * generateBlockTables' `versioned` param uses. Unlike the table name, the
 * SUBFIELD columns themselves do NOT get "version_"-prefixed - confirmed
 * `_eg_posts_v_version_categories.name`, not `.version_name`. `_parent_id`
 * points at whichever row owns it - for the versioned case that is the
 * VERSION ROW's own id, exactly like versioned blocks/rels (see
 * ../generic.ts's createArrayOps, which threads that through).
 */
export function generateArrayTable(collectionSlug: string, parentTableName: string, field: NamedField, suppressRequired = false, versioned = false) {
  if (field.type !== 'array') {
    throw new Error(`generateArrayTable(${collectionSlug}): field "${field.name}" is not an array field.`)
  }
  const tableName = versioned ? `${parentTableName}_version_${toSnakeCase(field.name)}` : `${parentTableName}_${toSnakeCase(field.name)}`

  const columns: Record<string, SQLiteColumnBuilderBase> = {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id').notNull(),
    id: versioned ? integer('id').primaryKey({ autoIncrement: true }) : text('id').primaryKey(),
  }

  const subFields = (field as unknown as { fields: Field[] }).fields
  const { columns: subColumns, arrayFields, blocksFields, relsFields, groupFields } = processFields(collectionSlug, subFields, '', suppressRequired)
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
  if (groupFields.length) {
    throw new Error(`generateArrayTable(${collectionSlug}): group field "${groupFields[0].name}" inside array "${field.name}" is not supported yet.`)
  }
  Object.assign(columns, subColumns)
  if (versioned) {
    columns.uuid = text('_uuid')
  }

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
 *
 * `versioned` produces the `_<table>_v_blocks_<slug>` shape instead (pass the
 * VERSIONS table's own name as `parentTableName` - confirmed the table name
 * itself never gets a "version_" infix, e.g. `_eg_pages_v_blocks_hero`, not
 * `_eg_pages_v_blocks_version_hero`): an integer autoincrement `id` in place
 * of the live table's string `id`, plus an extra `_uuid` text column -
 * confirmed against that same real table. `_parent_id` there is still just
 * an integer column pointing at whichever row owns it - for the versioned
 * case that is the VERSION ROW's own id (confirmed via `_eg_pages_v_blocks_hero`'s
 * FK target being `_eg_pages_v`, not the live `eg_pages` table), not the
 * live document's id - ../generic.ts's createVersionsOps is what threads
 * that through, not this generator.
 */
export function generateBlockTables(collectionSlug: string, parentTableName: string, field: NamedField, suppressRequired = false, versioned = false) {
  if (field.type !== 'blocks') {
    throw new Error(`generateBlockTables(${collectionSlug}): field "${field.name}" is not a blocks field.`)
  }
  const blockDefs = (field as unknown as { blocks: { slug: string; fields: Field[] }[] }).blocks

  return blockDefs.map((block) => {
    const tableName = `${parentTableName}_blocks_${toSnakeCase(block.slug)}`
    const { columns: fieldColumns, arrayFields, blocksFields, relsFields, groupFields } = processFields(collectionSlug, block.fields, '', suppressRequired)
    if (arrayFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): array field "${arrayFields[0].name}" inside block "${block.slug}" is not supported yet.`)
    }
    if (blocksFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): nested blocks field inside block "${block.slug}" is not supported yet.`)
    }
    if (groupFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): group field "${groupFields[0].name}" inside block "${block.slug}" is not supported yet.`)
    }

    const columns: Record<string, SQLiteColumnBuilderBase> = {
      order: integer('_order').notNull(),
      parentId: integer('_parent_id').notNull(),
      path: text('_path').notNull(),
      id: versioned ? integer('id').primaryKey({ autoIncrement: true }) : text('id').primaryKey(),
      ...fieldColumns,
      ...(versioned ? { uuid: text('_uuid') } : {}),
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
 * field into columns-to-generate, array fields, blocks fields,
 * hasMany/polymorphic relational fields, or group fields - the same triage
 * generateTable, generateArrayTable, generateBlockTables and
 * generateVersionsTable all need, factored out once.
 *
 * `dbNamePrefix` is how generateVersionsTable gets `version_`-prefixed
 * column names out of the exact same field list and the exact same JS
 * property keys as the live table (so callers can read `.title` off either
 * a live or a version row without caring which) - see generateVersionsTable.
 *
 * `join` fields are skipped entirely: Payload does not back them with a
 * column at all (confirmed against the real eg_events table - no `rsvps`
 * column exists for its `rsvps` join field), it resolves them at query time
 * against the related collection's own relationship field. That
 * query-time-join resolution is the "joins" phase in ../index.ts's roadmap,
 * not this one - for now, a join field's data simply is not part of the
 * document this data layer returns.
 */
function processFields(collectionSlug: string, fields: Field[], dbNamePrefix = '', suppressRequired = false) {
  const columns: Record<string, SQLiteColumnBuilderBase> = {}
  const arrayFields: NamedField[] = []
  const blocksFields: NamedField[] = []
  const relsFields: NamedField[] = []
  const groupFields: GroupFieldMeta[] = []

  for (const field of walkFields(collectionSlug, fields)) {
    if (field.type === 'join') {
      continue
    }
    if (field.type === 'array') {
      arrayFields.push(field)
      continue
    }
    if (field.type === 'blocks') {
      blocksFields.push(field)
      continue
    }
    if (field.type === 'group') {
      const subFields = (field as unknown as { fields: Field[] }).fields
      const groupDbPrefix = `${dbNamePrefix}${toSnakeCase(field.name)}_`
      const subFieldNames: string[] = []
      for (const subField of walkFields(collectionSlug, subFields)) {
        if (subField.type === 'array' || subField.type === 'blocks' || subField.type === 'group' || subField.type === 'join') {
          throw new Error(
            `generateTable(${collectionSlug}): group "${field.name}" may only contain plain fields - "${subField.name}" (${subField.type}) inside a group is not supported yet.`,
          )
        }
        if (isHasManyRelational(subField)) {
          throw new Error(
            `generateTable(${collectionSlug}): hasMany/polymorphic relationship "${subField.name}" inside group "${field.name}" is not supported yet.`,
          )
        }
        columns[`${field.name}${capitalize(subField.name)}`] = columnFor(collectionSlug, subField, groupDbPrefix, suppressRequired)
        subFieldNames.push(subField.name)
      }
      groupFields.push({ name: field.name, subFieldNames })
      continue
    }
    if (isHasManyRelational(field)) {
      relsFields.push(field)
      continue
    }
    columns[field.name] = columnFor(collectionSlug, field, dbNamePrefix, suppressRequired)
  }

  return { columns, arrayFields, blocksFields, relsFields, groupFields }
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

function columnFor(collectionSlug: string, field: NamedField, dbNamePrefix = '', suppressRequired = false): SQLiteColumnBuilderBase {
  const columnName = `${dbNamePrefix}${toSnakeCase(field.name)}`
  // See generateTable's suppressRequired comment: a collection with drafts
  // enabled never gets a SQL NOT NULL from `required`, live table or version
  // table alike - confirmed against real DDL, not assumed.
  const required = !suppressRequired && 'required' in field && field.required === true

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
