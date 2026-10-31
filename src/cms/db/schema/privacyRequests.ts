import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_privacy_requests` (hand-migrated: see
 * src/migrations/20270124_100000_privacy_requests.ts). Rows are written with bound statements by
 * src/features/privacy/store.ts. Column names must keep matching the migration.
 */
export const privacyRequests = sqliteTable(
  'eg_privacy_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id'),
    email: text('email').notNull(),
    status: text('status').notNull(),
    note: text('note').notNull().default(''),
    dueAt: text('due_at').notNull(),
    verifyHash: text('verify_hash'),
    verifyExpiresAt: text('verify_expires_at'),
    verifiedAt: text('verified_at'),
    decidedAt: text('decided_at'),
    decidedBy: integer('decided_by'),
    completedAt: text('completed_at'),
    result: text('result'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('eg_privacy_requests_status_idx').on(table.status, table.dueAt), index('eg_privacy_requests_user_idx').on(table.userId)],
)
