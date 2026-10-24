import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_email_verifications` (hand-migrated: see
 * src/migrations/20261121_100000_auth_slice_2.ts). Written with bound statements by
 * src/features/security/emailVerificationStore.ts. Only the SHA-256 of a token is stored.
 */
export const emailVerifications = sqliteTable(
  'eg_email_verifications',
  {
    id: text('id').primaryKey().notNull(),
    userId: integer('user_id').notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
  },
  (table) => [
    uniqueIndex('eg_email_verifications_token_idx').on(table.tokenHash),
    index('eg_email_verifications_user_idx').on(table.userId),
  ],
)
