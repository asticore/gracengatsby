import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_rate_limits` (hand-migrated: see
 * src/migrations/20261121_100000_auth_slice_2.ts). Fixed-window counters, one row per
 * key and window, written with bound statements by src/features/security/rateLimitStore.ts.
 */
export const rateLimits = sqliteTable(
  'eg_rate_limits',
  {
    key: text('key').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index('eg_rate_limits_expires_idx').on(table.expiresAt),
  ],
)
