import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirrors of `eg_password_groups`, and `eg_content_access` (hand-migrated: see
 * src/migrations/20261123_100000_password_groups.ts). Rows are written with bound raw SQL by
 * src/cms/db/passwordGroups.ts, so these are declared directly rather than through generateTable.
 * Column names must keep matching the migration. Only a PBKDF2 hash of a group password is stored.
 */
export const passwordGroups = sqliteTable(
  'eg_password_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    name: text('name').notNull(),
    hash: text('hash').notNull(),
    expiresAt: text('expires_at'),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('eg_password_groups_name_idx').on(table.name)],
)

export const contentAccess = sqliteTable(
  'eg_content_access',
  {
    collection: text('collection').notNull(),
    docId: integer('doc_id').notNull(),
    mode: text('mode').notNull(),
    groupId: integer('group_id'),
    roles: text('roles'),
    tiers: text('tiers'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.collection, table.docId] }), index('eg_content_access_group_idx').on(table.groupId)],
)
