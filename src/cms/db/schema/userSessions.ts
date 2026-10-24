import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_user_sessions` (hand-migrated: see
 * src/migrations/20261114_100000_user_sessions.ts). Not a collection - rows are
 * written with bound statements by src/features/security/userSessionStore.ts -
 * so it is declared directly rather than through generateTable. Column names
 * must keep matching the migration.
 */
export const userSessions = sqliteTable(
  'eg_user_sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    deviceLabel: text('device_label'),
    ip: text('ip'),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at'),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
  },
  (table) => [index('eg_user_sessions_user_id_idx').on(table.userId), index('eg_user_sessions_expires_at_idx').on(table.expiresAt)],
)
