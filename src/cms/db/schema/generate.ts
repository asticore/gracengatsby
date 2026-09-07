import type { CollectionConfig, Field } from '@/engine'

import { integer, numeric, sqliteTable, text, type SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import toSnakeCase from 'to-snake-case'

type NamedField = Field & { name: string }

/**
 * One `group` field's reconstruction metadata - see processFields' group
 * handling and ../generic.ts's nestGroups/flattenGroups.
 *
 * `arrayFieldNames` is only ever populated when this group itself lives
 * inside an array's own subfields (Forms' `conditional` group, containing a
 * `rules` array) - see processFields' `allowArrayInGroup` param. It lists,
 * alongside the plain scalar `subFieldNames`, which of the group's subfields
 * are themselves arrays reconstructed from their OWN child table rather than
 * a flat column - ../generic.ts's nestGroups/flattenGroups fold them into
 * the group object the exact same way as a scalar subfield, just sourced
 * from a pre-attached key instead of a real drizzle column.
 */
export type GroupFieldMeta = { name: string; subFieldNames: string[]; arrayFieldNames?: string[] }

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

/** True when a collection declares `upload: {...}` - Media is the only one in this app (confirmed by grep across src/collections and src/features). */
export function hasUpload(collection: CollectionConfig): boolean {
  return Boolean(collection.upload)
}

/**
 * The implicit columns Payload adds to an upload-enabled collection's table -
 * not declared in any of the collection's own `fields`. Confirmed against
 * the real eg_media schema (`pragma table_info`, not guessed): `url`,
 * `thumbnailURL` (column `thumbnail_u_r_l` - `to-snake-case`, the same
 * naming lib every other column name in this file goes through, splits each
 * capital letter of "URL" into its own segment), `filename`, `mimeType`
 * (`mime_type`), `filesize`, `width`, `height` - all nullable, the last
 * three numeric (`mode: 'number'`, same as any Payload `number` field),
 * everything else text. They land AFTER `updatedAt`/`createdAt` in real
 * column order, confirmed by the same `pragma table_info` dump.
 *
 * This app's only upload-enabled collection (Media) sets
 * `upload: { crop: false, focalPoint: false }` and no `imageSizes` - so
 * `focalX`/`focalY` (from `focalPoint: true`) and any per-size `sizes_*`
 * columns (from `imageSizes`) are NOT modeled here, and generateTable throws
 * rather than silently omitting them if a future collection turns either on.
 */
function uploadColumns(): Record<string, SQLiteColumnBuilderBase> {
  return {
    url: text('url'),
    thumbnailURL: text(toSnakeCase('thumbnailURL')),
    filename: text('filename'),
    mimeType: text(toSnakeCase('mimeType')),
    filesize: numeric('filesize', { mode: 'number' }),
    width: numeric('width', { mode: 'number' }),
    height: numeric('height', { mode: 'number' }),
  }
}

/** True when a collection declares `auth: true` (or an auth config object) - Users is this app's only one (confirmed by grep across src/collections and src/features). */
export function hasAuth(collection: CollectionConfig): boolean {
  return Boolean(collection.auth)
}

/**
 * The implicit columns Payload adds to an auth-enabled collection's table -
 * not declared in any of the collection's own `fields` (Users' own `fields`
 * list has only `roles`, itself a hasMany select - see
 * generateSelectHasManyTable). Confirmed against the real eg_users schema
 * (`pragma table_info`, not guessed): `email` (the one NOT NULL auth column),
 * `resetPasswordToken`/`resetPasswordExpiration`, `salt`/`hash` (the
 * password, once set), `loginAttempts` (numeric, defaults to 0),
 * `lockUntil`, and - because this app's Users collection doesn't disable
 * either - three two-factor columns (`twoFactorEnabled` - boolean, defaults
 * false - `twoFactorSecret`, `twoFactorConfirmedAt`) plus
 * `twoFactorLastUsedStep` (numeric). All nullable except `email`. They land
 * AFTER `updatedAt`/`createdAt` in real column order - the same slot
 * uploadColumns() uses - confirmed by the same `pragma table_info` dump.
 *
 * This data layer never writes `salt`/`hash` itself (hashing a real password
 * into them is Payload's own auth strategy, out of scope the same way actual
 * file upload/resize stays Payload's job for `upload` - see uploadColumns'
 * doc comment) - collections/users.ts's create/update ops only ever touch
 * `email` and `roles`.
 *
 * Also confirmed, and deliberately NOT modeled here: `auth: true` (with its
 * default `useSessions: true`, which this app's Users config does not
 * override) additionally creates an `eg_users_sessions` child table - the
 * exact shape an array field's child table has (`_order`/`_parent_id`/string
 * `id`, plus `created_at`/`expires_at`). Nothing in this data layer's
 * create/update path can ever populate it: Payload only writes a session row
 * during its own login/token-refresh flow, which this data layer does not
 * implement (auth itself, not just its storage, stays entirely Payload's
 * job) - confirmed empirically too: a real `engine.create()`/`findByID()`
 * round trip through Payload's own Local API (which never logs in) returns
 * `sessions: []` every time. So it is left ungenerated rather than modeled
 * and never written to - the same reasoning Phase 12 used to leave
 * `imageSizes`/`focalPoint: true` unmodeled until something actually
 * exercises them.
 */
function authColumns(): Record<string, SQLiteColumnBuilderBase> {
  return {
    email: text('email').notNull(),
    resetPasswordToken: text(toSnakeCase('resetPasswordToken')),
    resetPasswordExpiration: text(toSnakeCase('resetPasswordExpiration')),
    salt: text('salt'),
    hash: text('hash'),
    loginAttempts: numeric(toSnakeCase('loginAttempts'), { mode: 'number' }).default(0),
    lockUntil: text(toSnakeCase('lockUntil')),
    twoFactorEnabled: integer(toSnakeCase('twoFactorEnabled'), { mode: 'boolean' }).default(false),
    twoFactorSecret: text(toSnakeCase('twoFactorSecret')),
    twoFactorConfirmedAt: text(toSnakeCase('twoFactorConfirmedAt')),
    twoFactorLastUsedStep: numeric(toSnakeCase('twoFactorLastUsedStep'), { mode: 'number' }),
  }
}

/** True for a hasMany `select` field - needs its own child table (generateSelectHasManyTable), same reason a hasMany relationship/upload field needs generateRelsTable instead of a plain column. */
function isHasManySelect(field: NamedField): boolean {
  return field.type === 'select' && 'hasMany' in field && field.hasMany === true
}

/**
 * A child table for one hasMany `select` field - Users' `roles` is this
 * app's only one. Confirmed against the real eg_users_roles table: unlike an
 * array field's child table (generateArrayTable), the row-order/parent-FK
 * columns carry NO underscore prefix (`order`, `parent_id`, not `_order`,
 * `_parent_id`), the row `id` is an integer autoincrement (never a string -
 * a select option has no subfields needing an addressable row identity the
 * way an array item's own `id` does), and there is a single nullable `value`
 * text column holding each selected option's stored value. One row per
 * selected option, ordered by `order` ascending - confirmed by creating a
 * real user with `roles: ['admin', 'customer']` and reading back the exact
 * same order via both Payload's own engine and this table directly.
 */
export function generateSelectHasManyTable(parentTableName: string, field: NamedField) {
  if (!isHasManySelect(field)) {
    throw new Error(`generateSelectHasManyTable: field "${field.name}" is not a hasMany select field.`)
  }
  const tableName = `${parentTableName}_${toSnakeCase(field.name)}`
  const columns: Record<string, SQLiteColumnBuilderBase> = {
    order: integer('order').notNull(),
    parentId: integer('parent_id').notNull(),
    value: text('value'),
    id: integer('id').primaryKey({ autoIncrement: true }),
  }
  return sqliteTable(tableName, columns)
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
 *   join                                                 -> no column - bucketed into `joinFields` for
 *                                                          ../generic.ts's createJoinOps to resolve at query
 *                                                          time against the related collection's own field
 *
 * `versions: { drafts: true }` on the collection adds the implicit `_status`
 * column Payload adds itself (confirmed against eg_pages/eg_events - not a
 * declared field), and generateVersionsTable derives the parallel
 * `_<table>_v` table from the exact same field list.
 *
 * `upload: {...}` on the collection (Media is this app's only one) adds
 * Payload's own implicit upload columns (`url`, `thumbnailURL`, `filename`,
 * `mimeType`, `filesize`, `width`, `height`) - see hasUpload/uploadColumns'
 * doc comment for the confirmed real shape and what's deliberately NOT
 * modeled (`imageSizes`, `focalPoint: true`).
 *
 * `auth: true` on the collection (Users is this app's only one) adds
 * Payload's own implicit auth columns (`email`, password/reset/lockout/
 * two-factor columns) - see hasAuth/authColumns' doc comment for the
 * confirmed real shape and what's deliberately NOT modeled (the
 * `eg_users_sessions` child table).
 *
 * hasMany `select` (Users' `roles` is this app's only one) -> a child table,
 * same idea as a hasMany relationship/upload field but its own distinct
 * shape - see generateSelectHasManyTable.
 *
 * NOT supported yet (throws): tabs, group/array/blocks nesting inside one
 * another or inside a hasMany-relational field's own fields, `timestamps:
 * false` (every generated table gets updatedAt/createdAt), an
 * upload-enabled collection with drafts, an upload-enabled collection using
 * `imageSizes` or `focalPoint: true`, and an auth-enabled collection with
 * drafts or upload. Each needs different modelling - see ../index.ts.
 */
export function generateTable(collection: CollectionConfig) {
  if (typeof collection.dbName === 'function') {
    throw new Error(`generateTable(${collection.slug}): a function dbName is not supported yet.`)
  }
  if (hasUpload(collection)) {
    const upload = collection.upload as { imageSizes?: unknown[]; focalPoint?: boolean }
    if (upload.imageSizes && upload.imageSizes.length > 0) {
      throw new Error(`generateTable(${collection.slug}): upload.imageSizes is not supported yet.`)
    }
    if (upload.focalPoint) {
      throw new Error(`generateTable(${collection.slug}): upload.focalPoint is not supported yet.`)
    }
    if (hasDrafts(collection)) {
      throw new Error(`generateTable(${collection.slug}): an upload-enabled collection with drafts is not supported yet.`)
    }
  }
  if (hasAuth(collection)) {
    if (hasUpload(collection)) {
      throw new Error(`generateTable(${collection.slug}): an auth-enabled collection with upload is not supported yet.`)
    }
    if (hasDrafts(collection)) {
      throw new Error(`generateTable(${collection.slug}): an auth-enabled collection with drafts is not supported yet.`)
    }
  }
  const tableName = tableNameFor(collection)
  // A draft save must be allowed to leave required fields empty, so Payload
  // never emits a SQL NOT NULL for `required` on a collection with drafts
  // enabled - confirmed by inspecting real DDL: eg_faqs.question (required,
  // no drafts) is NOT NULL, but eg_events.title / eg_events.start_date and
  // eg_pages.title (all required, both collections have drafts) are not.
  const suppressRequired = hasDrafts(collection)

  const { columns: fieldColumns, arrayFields, blocksFields, relsFields, groupFields, joinFields, selectFields } = processFields(
    collection.slug,
    collection.fields,
    '',
    suppressRequired,
  )

  const columns: Record<string, SQLiteColumnBuilderBase> = {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...fieldColumns,
  }
  columns.updatedAt = text('updated_at').notNull()
  columns.createdAt = text('created_at').notNull()
  if (hasUpload(collection)) {
    Object.assign(columns, uploadColumns())
  }
  if (hasAuth(collection)) {
    Object.assign(columns, authColumns())
  }
  if (hasDrafts(collection)) {
    columns._status = statusColumn('')
  }

  return { table: sqliteTable(tableName, columns), tableName, arrayFields, blocksFields, relsFields, groupFields, joinFields, selectFields }
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
  const { columns: fieldColumns, arrayFields, blocksFields, relsFields, groupFields, selectFields } = processFields(collection.slug, collection.fields, 'version_', true)
  if (selectFields.length) {
    throw new Error(`generateVersionsTable(${collection.slug}): hasMany select "${selectFields[0].name}" on a drafts-enabled collection is not supported yet.`)
  }

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
 *
 * `group` fields ARE supported directly in an array's own subfields
 * (confirmed against real `eg_forms_fields`' `calculation_*`/`pricing_*`/
 * `conditional_*` columns): processFields' own group branch already
 * flattens them onto this table exactly like a top-level group would,
 * reusing the same `groupDbPrefix` mechanism - the returned `groupFields`
 * feeds ../generic.ts's nestGroups/flattenGroups so array ROWS reconstruct
 * a nested group object too, not just top-level documents.
 *
 * A nested `array` field inside this array's own subfields, OR inside one of
 * its groups, is ALSO supported now (confirmed against the real
 * `eg_field_groups_fields_options`/`eg_forms_fields_options`/
 * `eg_forms_fields_conditional_rules` tables): each becomes its own child
 * table via generateNestedArrayTable, keyed by a TEXT `_parent_id` pointing
 * at THIS array's own row id (a string, not the top-level document's integer
 * id) - a different shape from every other child table this module
 * generates, which all key off an integer document/version-row id. The
 * returned `nestedArrayFields` names each one plus, when it lives inside a
 * group, which group - ../generic.ts's createArrayOps consumes this to
 * attach/write them nested one level deeper. Confirmed flat leaves in both
 * FieldGroups and Forms - no further nesting inside a nested array table is
 * modeled (generateNestedArrayTable itself still throws on one).
 *
 * Still NOT supported inside an array's own subfields: `blocks`,
 * hasMany/polymorphic relationship, hasMany `select` - nothing in this app's
 * real config needs any of those at this level yet. `versioned` additionally
 * never allows a nested array or a group (nothing in this app's versioned
 * collections needs either there yet - Posts' `version_categories` and
 * PageTemplates' versioned blocks are this module's only versioned-array
 * cases, and neither has one) - still throws for those, even though the live
 * path above now supports them.
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
  const {
    columns: subColumns,
    arrayFields,
    blocksFields,
    relsFields,
    groupFields,
    selectFields,
    groupArrayFields,
  } = processFields(collectionSlug, subFields, '', suppressRequired, !versioned)
  if (versioned && (arrayFields.length || groupArrayFields.length)) {
    throw new Error(`generateArrayTable(${collectionSlug}): a nested array inside a VERSIONED array "${field.name}" is not supported yet.`)
  }
  if (versioned && groupFields.length) {
    throw new Error(`generateArrayTable(${collectionSlug}): group field "${groupFields[0].name}" inside a VERSIONED array "${field.name}" is not supported yet.`)
  }
  if (blocksFields.length) {
    throw new Error(`generateArrayTable(${collectionSlug}): blocks field "${blocksFields[0].name}" inside array "${field.name}" is not supported yet.`)
  }
  if (relsFields.length) {
    throw new Error(
      `generateArrayTable(${collectionSlug}): hasMany/polymorphic relationship "${relsFields[0].name}" inside array "${field.name}" is not supported yet.`,
    )
  }
  if (selectFields.length) {
    throw new Error(`generateArrayTable(${collectionSlug}): hasMany select "${selectFields[0].name}" inside array "${field.name}" is not supported yet.`)
  }
  Object.assign(columns, subColumns)
  if (versioned) {
    columns.uuid = text('_uuid')
  }

  const nestedArrayFields: { name: string; groupName?: string; table: ReturnType<typeof sqliteTable> }[] = []
  for (const nestedField of arrayFields) {
    const nested = generateNestedArrayTable(collectionSlug, tableName, nestedField, suppressRequired)
    nestedArrayFields.push({ name: nestedField.name, table: nested.table })
  }
  for (const { groupName, groupDbPrefix, field: nestedField } of groupArrayFields) {
    const nested = generateNestedArrayTable(collectionSlug, tableName, nestedField, suppressRequired, groupDbPrefix)
    nestedArrayFields.push({ name: nestedField.name, groupName, table: nested.table })
  }

  return { table: sqliteTable(tableName, columns), tableName, groupFields, nestedArrayFields }
}

/**
 * A child table for one array field nested INSIDE another array's own
 * subfields (directly, or inside one of that array's groups) - see
 * generateArrayTable's doc comment. Shaped like a live (non-versioned) array
 * child table (`_order`, string `id` per row), except `_parent_id` is TEXT,
 * not integer: it references the PARENT ARRAY ROW's own string id, not any
 * top-level document/version-row integer id - confirmed against the real
 * `eg_field_groups_fields_options`/`eg_forms_fields_options`/
 * `eg_forms_fields_conditional_rules` tables via `pragma table_info`.
 *
 * `groupDbPrefix` reproduces the table-name half of processFields' own
 * group-prefix mechanism (`eg_forms_fields` + `conditional_` + `rules` =
 * `eg_forms_fields_conditional_rules`) for a nested array living inside one
 * of the parent array's groups; omit it (default '') for one living directly
 * in the parent array's own subfields (`eg_forms_fields` + `options` =
 * `eg_forms_fields_options`).
 *
 * Confirmed a flat leaf in both FieldGroups and Forms - no further array,
 * blocks, group, hasMany-relational or hasMany-select nesting inside a
 * nested array's own subfields is modeled; this throws on all of them rather
 * than guessing a shape nothing in this app's real config exercises.
 */
export function generateNestedArrayTable(collectionSlug: string, parentArrayTableName: string, field: NamedField, suppressRequired = false, groupDbPrefix = '') {
  if (field.type !== 'array') {
    throw new Error(`generateNestedArrayTable(${collectionSlug}): field "${field.name}" is not an array field.`)
  }
  const tableName = `${parentArrayTableName}_${groupDbPrefix}${toSnakeCase(field.name)}`

  const columns: Record<string, SQLiteColumnBuilderBase> = {
    order: integer('_order').notNull(),
    parentId: text('_parent_id').notNull(),
    id: text('id').primaryKey(),
  }

  const subFields = (field as unknown as { fields: Field[] }).fields
  const { columns: subColumns, arrayFields, blocksFields, relsFields, groupFields, selectFields } = processFields(collectionSlug, subFields, '', suppressRequired)
  if (arrayFields.length) {
    throw new Error(`generateNestedArrayTable(${collectionSlug}): nested array "${arrayFields[0].name}" inside nested array "${field.name}" is not supported yet.`)
  }
  if (blocksFields.length) {
    throw new Error(`generateNestedArrayTable(${collectionSlug}): blocks field "${blocksFields[0].name}" inside nested array "${field.name}" is not supported yet.`)
  }
  if (relsFields.length) {
    throw new Error(
      `generateNestedArrayTable(${collectionSlug}): hasMany/polymorphic relationship "${relsFields[0].name}" inside nested array "${field.name}" is not supported yet.`,
    )
  }
  if (groupFields.length) {
    throw new Error(`generateNestedArrayTable(${collectionSlug}): group field "${groupFields[0].name}" inside nested array "${field.name}" is not supported yet.`)
  }
  if (selectFields.length) {
    throw new Error(`generateNestedArrayTable(${collectionSlug}): hasMany select "${selectFields[0].name}" inside nested array "${field.name}" is not supported yet.`)
  }
  Object.assign(columns, subColumns)

  return { table: sqliteTable(tableName, columns), tableName }
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
    const { columns: fieldColumns, arrayFields, blocksFields, relsFields, groupFields, selectFields } = processFields(collectionSlug, block.fields, '', suppressRequired)
    if (arrayFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): array field "${arrayFields[0].name}" inside block "${block.slug}" is not supported yet.`)
    }
    if (blocksFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): nested blocks field inside block "${block.slug}" is not supported yet.`)
    }
    if (groupFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): group field "${groupFields[0].name}" inside block "${block.slug}" is not supported yet.`)
    }
    if (selectFields.length) {
      throw new Error(`generateBlockTables(${collectionSlug}): hasMany select "${selectFields[0].name}" inside block "${block.slug}" is not supported yet.`)
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
 * `join` fields get no column of their own: Payload does not back them with
 * one at all (confirmed against the real eg_events table - no `rsvps`
 * column exists for its `rsvps` join field). They are bucketed into the
 * returned `joinFields` instead, for ../generic.ts's createJoinOps to
 * resolve at QUERY TIME against the related collection's own relationship
 * field - see that function's doc comment and generateVersionsTable's (join
 * fields are never part of a version snapshot; they're always resolved
 * against the live, current related documents, regardless of which version
 * of the parent you're looking at).
 *
 * `allowArrayInGroup` relaxes the group-validation throw for one specific,
 * confirmed-real shape: an `array` subfield nested inside a `group` that is
 * itself among an ARRAY field's own subfields (Forms' `conditional` group
 * containing a `rules` array, confirmed against the real
 * `eg_forms_fields_conditional_rules` table). Only generateArrayTable passes
 * this - generateTable/generateVersionsTable/generateBlockTables never do,
 * so a top-level group-containing-array (nothing in this app's real config
 * exercises that) still throws, exactly as before.
 */
function processFields(collectionSlug: string, fields: Field[], dbNamePrefix = '', suppressRequired = false, allowArrayInGroup = false) {
  const columns: Record<string, SQLiteColumnBuilderBase> = {}
  const arrayFields: NamedField[] = []
  const blocksFields: NamedField[] = []
  const relsFields: NamedField[] = []
  const groupFields: GroupFieldMeta[] = []
  const joinFields: NamedField[] = []
  const selectFields: NamedField[] = []
  const groupArrayFields: GroupArrayFieldMeta[] = []

  for (const field of walkFields(collectionSlug, fields)) {
    if (field.type === 'join') {
      joinFields.push(field)
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
    if (isHasManySelect(field)) {
      selectFields.push(field)
      continue
    }
    if (field.type === 'group') {
      const subFields = (field as unknown as { fields: Field[] }).fields
      const groupDbPrefix = `${dbNamePrefix}${toSnakeCase(field.name)}_`
      const subFieldNames: string[] = []
      const arrayFieldNames: string[] = []
      for (const subField of walkFields(collectionSlug, subFields)) {
        if (subField.type === 'array' && allowArrayInGroup) {
          groupArrayFields.push({ groupName: field.name, groupDbPrefix, field: subField })
          arrayFieldNames.push(subField.name)
          continue
        }
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
        if (isHasManySelect(subField)) {
          throw new Error(`generateTable(${collectionSlug}): hasMany select "${subField.name}" inside group "${field.name}" is not supported yet.`)
        }
        columns[`${field.name}${capitalize(subField.name)}`] = columnFor(collectionSlug, subField, groupDbPrefix, suppressRequired)
        subFieldNames.push(subField.name)
      }
      groupFields.push({ name: field.name, subFieldNames, arrayFieldNames: arrayFieldNames.length ? arrayFieldNames : undefined })
      continue
    }
    if (isHasManyRelational(field)) {
      relsFields.push(field)
      continue
    }
    columns[field.name] = columnFor(collectionSlug, field, dbNamePrefix, suppressRequired)
  }

  return { columns, arrayFields, blocksFields, relsFields, groupFields, joinFields, selectFields, groupArrayFields }
}

/**
 * One nested-array-inside-a-group field found while walking an array's own
 * subfields with `allowArrayInGroup` - see processFields. `groupDbPrefix` is
 * the exact prefix generateArrayTable needs to reproduce the confirmed real
 * table name (`eg_forms_fields` + `conditional_` + `rules` =
 * `eg_forms_fields_conditional_rules`) - the same prefix processFields' own
 * group branch already computes for that group's plain scalar columns.
 */
type GroupArrayFieldMeta = { groupName: string; groupDbPrefix: string; field: NamedField }

/** A `join` field's own config, as Payload declares it - `collection` is the single related collection slug (this app has no polymorphic join yet), `on` is the name of the relationship/hasMany field on THAT collection which points back here. */
export type JoinFieldMeta = NamedField & { collection: string; on: string; defaultSort?: string }

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
      // processFields() already routes a hasMany select field to
      // selectFields before this is ever called (see isHasManySelect) - only
      // a single-value select reaches here, always a plain text column.
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
