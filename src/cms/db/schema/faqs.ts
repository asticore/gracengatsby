import { integer, numeric, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle table definition for `eg_faqs`, hand-matched column-for-column
 * against what is actually in the database right now (checked with
 * `PRAGMA table_info(eg_faqs)` against local D1, and cross-referenced with
 * `payload generate:db-schema`'s output for src/collections/Faqs.ts).
 *
 * Faqs has no relationship, array or blocks fields, so it needs no child
 * tables (`_rels`, per-array-item tables) - the whole collection is one row.
 * That is exactly why it is the first target: see ../index.ts.
 */
export const faqs = sqliteTable('eg_faqs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  question: text('question').notNull(),
  // Stores the richText field's Lexical JSON document as a string, same as
  // Payload's own adapter does for any JSON-family column.
  answer: text('answer').notNull(),
  category: text('category'),
  order: numeric('order', { mode: 'number' }),
  updatedAt: text('updated_at').notNull(),
  createdAt: text('created_at').notNull(),
  // customFieldsField (src/fields/customFields.ts) - one JSON column, keyed
  // by Field Group field name.
  customFields: text('custom_fields'),
})
