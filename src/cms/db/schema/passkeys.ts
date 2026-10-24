import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle mirror of `eg_passkeys` (hand-migrated: see
 * src/migrations/20261118_100000_passkeys.ts). Rows are written with bound
 * statements by src/features/passkeys/store.ts, so this is declared directly
 * rather than through generateTable. Column names must keep matching the migration.
 */
export const passkeys = sqliteTable(
  'eg_passkeys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    signCount: integer('sign_count').notNull().default(0),
    transports: text('transports'),
    deviceLabel: text('device_label'),
    backedUp: integer('backed_up').notNull().default(0),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
  },
  (table) => [
    uniqueIndex('eg_passkeys_credential_idx').on(table.credentialId),
    index('eg_passkeys_user_idx').on(table.userId),
  ],
)
