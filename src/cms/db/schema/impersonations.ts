import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_impersonations` (hand-migrated: see
 * src/migrations/20261120_100000_impersonation.ts). Rows are written with bound
 * statements by src/features/impersonation/store.ts, so this is declared directly
 * rather than through generateTable. Column names must keep matching the migration.
 * No password or token is stored here: only who, whom, why, when, and the device session id.
 */
export const impersonations = sqliteTable(
  'eg_impersonations',
  {
    id: text('id').primaryKey().notNull(),
    adminId: integer('admin_id').notNull(),
    adminEmail: text('admin_email').notNull(),
    targetUserId: integer('target_user_id').notNull(),
    targetEmail: text('target_email').notNull(),
    reason: text('reason').notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    expiresAt: text('expires_at').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),
  },
  (table) => [
    index('eg_impersonations_admin_idx').on(table.adminId),
    index('eg_impersonations_target_idx').on(table.targetUserId),
    index('eg_impersonations_started_idx').on(table.startedAt),
  ],
)
