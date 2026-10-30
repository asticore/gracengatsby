import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirrors of the API builder tables (hand-migrated: see
 * src/migrations/20270110_100000_api_endpoints.ts). Rows are written with bound
 * statements by src/features/apiBuilder/store.ts. Column names must keep matching the migration.
 */
export const apiEndpoints = sqliteTable(
  'eg_api_endpoints',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    version: text('version').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    collection: text('collection').notNull(),
    config: text('config').notNull(),
    enabled: integer('enabled').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('eg_api_endpoints_path_idx').on(table.version, table.slug)],
)

export const apiEndpointLog = sqliteTable(
  'eg_api_endpoint_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    endpointId: integer('endpoint_id').notNull(),
    keyId: integer('key_id'),
    userId: integer('user_id'),
    method: text('method').notNull(),
    status: integer('status').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('eg_api_endpoint_log_endpoint_idx').on(table.endpointId, table.createdAt), index('eg_api_endpoint_log_created_idx').on(table.createdAt)],
)

export const apiBuilderSettings = sqliteTable('eg_api_builder_settings', {
  id: integer('id').primaryKey(),
  docsPublic: integer('docs_public').notNull().default(0),
  docsToken: text('docs_token').notNull(),
  updatedAt: text('updated_at').notNull(),
})
