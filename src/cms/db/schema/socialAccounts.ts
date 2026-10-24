import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_social_accounts` (hand-migrated: see
 * src/migrations/20261115_100000_social_login.ts). Rows are written with bound
 * statements by src/features/socialLogin/store.ts, so this is declared directly
 * rather than through generateTable. Column names must keep matching the migration.
 */
export const socialAccounts = sqliteTable(
  'eg_social_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email'),
    createdAt: text('created_at').notNull(),
    lastLoginAt: text('last_login_at'),
  },
  (table) => [
    uniqueIndex('eg_social_accounts_provider_user_idx').on(table.provider, table.providerUserId),
    index('eg_social_accounts_user_id_idx').on(table.userId),
  ],
)
