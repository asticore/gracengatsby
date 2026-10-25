import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_two_factor_email_codes` (hand-migrated: see
 * src/migrations/20261122_100000_auth_slice_3.ts). Rows are written with bound
 * statements by src/features/security/twoFactorEmailStore.ts. Column names must keep
 * matching the migration. Only a salted hash of the six-digit code is stored.
 */
export const twoFactorEmailCodes = sqliteTable(
  'eg_two_factor_email_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    purpose: text('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
  },
  (table) => [index('eg_two_factor_email_codes_user_idx').on(table.userId)],
)
