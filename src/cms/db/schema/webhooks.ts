import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirrors of the webhooks tables (hand-migrated: see
 * src/migrations/20270117_100000_webhooks.ts). Rows are written with bound statements by
 * src/features/webhooks/store.ts. Column names must keep matching the migration.
 */
export const webhooks = sqliteTable('eg_webhooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  url: text('url').notNull(),
  events: text('events').notNull(),
  template: text('template'),
  secret: text('secret').notNull(),
  enabled: integer('enabled').notNull().default(1),
  ratePerMinute: integer('rate_per_minute').notNull().default(60),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const webhookDeliveries = sqliteTable(
  'eg_webhook_deliveries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    webhookId: integer('webhook_id').notNull(),
    deliveryId: text('delivery_id').notNull(),
    event: text('event').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: text('next_attempt_at'),
    lastStatusCode: integer('last_status_code'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('eg_webhook_deliveries_due_idx').on(table.status, table.nextAttemptAt), index('eg_webhook_deliveries_webhook_idx').on(table.webhookId, table.createdAt)],
)
