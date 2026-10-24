import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_trusted_devices` (hand-migrated: see
 * src/migrations/20261122_100000_auth_slice_3.ts). Rows are written with bound
 * statements by src/features/security/trustedDeviceStore.ts. Column names must keep
 * matching the migration. Only the SHA-256 of the cookie secret is stored.
 */
export const trustedDevices = sqliteTable(
  'eg_trusted_devices',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    label: text('label'),
    ip: text('ip'),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
  },
  (table) => [
    index('eg_trusted_devices_user_idx').on(table.userId),
    uniqueIndex('eg_trusted_devices_hash_idx').on(table.tokenHash),
  ],
)
