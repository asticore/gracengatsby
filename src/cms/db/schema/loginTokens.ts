import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_login_tokens` (hand-migrated: see
 * src/migrations/20261117_100000_passwordless_login.ts). Rows are written with bound
 * statements by src/features/passwordless/store.ts, so this is declared directly
 * rather than through generateTable. Column names must keep matching the migration.
 */
export const loginTokens = sqliteTable(
  'eg_login_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    kind: text('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
  },
  (table) => [
    index('eg_login_tokens_user_idx').on(table.userId, table.kind),
    index('eg_login_tokens_hash_idx').on(table.tokenHash),
  ],
)
