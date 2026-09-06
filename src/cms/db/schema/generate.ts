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
 *   relationship (single target, not hasMany)           -> integer `<name>_id` column
 *   row, collapsible                                    -> flattened, fields promoted onto this table
 *   array                                                -> a child table, see generateArrayTable
 *
 * NOT supported yet (throws): blocks, group, tabs, join, upload,
 * hasMany/polymorphic relationship, hasMany select, and `timestamps: false`
 * (every generated table gets updatedAt/createdAt). Each needs different
 * modelling and is a later phase - see ../index.ts.
 */
export function generateTable(collection: CollectionConfig) {
  // dbName can be a function (computed per-args) in Payload's type, but every
  // collection this generator has been pointed at sets it as a plain string.
  if (typeof collection.dbName === 'function') {
    throw new Error(`generateTable(${collection.slug}): a function dbName is not supported yet.`)
  }
  const tableName = collection.dbName || toSnakeCase(collection.slug)

  const columns: Record<string, SQLiteColumnBuilderBase> = {
    id: integer('id').primaryKey({ autoIncrement: true }),
  }
  const arrayFields: NamedField[] = []

  for (const field of walkFields(collection.slug, collection.fields)) {
    if (field.type === 'array') {
      arrayFields.push(field)
      continue
    }
    columns[field.name] = columnFor(collection.slug, field)
  }

  columns.updatedAt = text('updated_at').notNull()
  columns.createdAt = text('created_at').notNull()

  return { table: sqliteTable(tableName, columns), tableName, arrayFields }
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
  for (const subField of walkFields(collectionSlug, subFields)) {
    if (subField.type === 'array') {
      throw new Error(`generateArrayTable(${collectionSlug}): nested array "${subField.name}" inside array "${field.name}" is not supported yet.`)
    }
    columns[subField.name] = columnFor(collectionSlug, subField)
  }

  return sqliteTable(tableName, columns)
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
    case 'relationship': {
      const hasMany = 'hasMany' in field && field.hasMany
      const polymorphic = Array.isArray((field as { relationTo?: unknown }).relationTo)
      if (hasMany || polymorphic) {
        throw new Error(
          `generateTable(${collectionSlug}): relationship field "${field.name}" is hasMany or polymorphic - needs a child (_rels) table, not supported yet.`,
        )
      }
      column = integer(`${columnName}_id`)
      break
    }
    default:
      throw new Error(`generateTable(${collectionSlug}): field type "${field.type}" is not supported yet.`)
  }

  return (required ? column.notNull() : column) as SQLiteColumnBuilderBase
}
