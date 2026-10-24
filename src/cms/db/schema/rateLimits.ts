import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_rate_limits` (hand-migrated: see
 * src/migrations/20261121_100000_rate_limits.ts). Not a collection - rows are
 * written with a bound upsert by src/features/security/rateLimitStore.ts - so
 * it is declared directly. Column names must keep matching the migration.
 */
export const rateLimits = sqliteTable(
  'eg_rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    windowStart: integer('window_start').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('eg_rate_limits_expires_at_idx').on(table.expiresAt)],
)
