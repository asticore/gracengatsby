import type { CollectionConfig, Field } from '@/engine'

import { integer, numeric, sqliteTable, text, type SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import toSnakeCase from 'to-snake-case'

/**
 * Derives a drizzle table from a real Payload CollectionConfig - the
 * generalisation promised in ../index.ts, proven against two collections now
 * instead of one hand-copied table (see ./faqs.ts's history: it used to be
 * hand-written and column-matched against the live database by hand; this
 * generator produces the same table from the collection's own field list).
 *
 * Deliberately narrow: throws on anything it does not yet model correctly,
 * rather than silently generating a wrong or partial column. Currently
 * supports flat top-level fields only (no row/tabs/collapsible wrappers,
 * which need recursion into nested field arrays) and these field types:
 *
 *   text, textarea, email, date, select (single-value) -> text column
 *   richText, json                                     -> text column, JSON mode
 *   number                                              -> numeric column
 *   checkbox                                            -> integer column, boolean mode
 *   relationship (single target, not hasMany)           -> integer `<name>_id` column
 *
 * NOT supported yet (throws): array, blocks, group, row, tabs, collapsible,
 * join, upload, hasMany/polymorphic relationship, hasMany select, and
 * `timestamps: false` (every generated table gets updatedAt/createdAt).
 * Each of those needs a child table or different modelling and is a later
 * phase - see ../index.ts.
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

  for (const field of collection.fields) {
    const named = field as Field & { name?: string }
    if (!named.name) {
      throw new Error(
        `generateTable(${collection.slug}): field of type "${named.type}" has no top-level name - row/tabs/collapsible wrappers aren't supported yet.`,
      )
    }
    // Payload's Field union has per-variant required props (e.g. collapsible's
    // `label`) that don't survive a plain narrowing cast once `name` is known
    // - not a real type mismatch, just TS being unable to prove it structurally.
    columns[named.name] = columnFor(collection.slug, named as unknown as Field & { name: string })
  }

  columns.updatedAt = text('updated_at').notNull()
  columns.createdAt = text('created_at').notNull()

  return sqliteTable(tableName, columns)
}

function columnFor(collectionSlug: string, field: Field & { name: string }): SQLiteColumnBuilderBase {
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
