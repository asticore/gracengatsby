import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_api_keys` (hand-migrated: see
 * src/migrations/20261119_100000_api_keys.ts). Rows are written with bound
 * statements by src/features/apiKeys/store.ts, so this is declared directly
 * rather than through generateTable. Column names must keep matching the migration.
 * Only the SHA-256 hash of a key is stored, never the key itself.
 */
export const apiKeys = sqliteTable(
  'eg_api_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
  },
  (table) => [
    uniqueIndex('eg_api_keys_hash_idx').on(table.keyHash),
    index('eg_api_keys_user_idx').on(table.userId),
  ],
)
