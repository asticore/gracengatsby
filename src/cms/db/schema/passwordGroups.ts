import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirrors of the password-group tables (hand-migrated: see
 * src/migrations/20261121_100000_password_groups.ts). Column names must keep
 * matching the migration. Only the PBKDF2 hash of a group password is stored.
 */
export const passwordGroups = sqliteTable(
  'eg_password_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    hash: text('hash').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('eg_password_groups_name_idx').on(table.name)],
)

export const contentPasswords = sqliteTable(
  'eg_content_passwords',
  {
    collection: text('collection').notNull(),
    docId: integer('doc_id').notNull(),
    hash: text('hash').notNull(),
    updatedAt: text('updated_at').notNull(),
    groupId: integer('group_id'),
    unlockRoles: text('unlock_roles'),
    unlockTiers: text('unlock_tiers'),
  },
  (table) => [
    primaryKey({ columns: [table.collection, table.docId] }),
    index('eg_content_passwords_group_idx').on(table.groupId),
  ],
)
