/**
 * The last tables that still carried the old engine's name.
 *
 * The earlier rename (see tableRenames.ts) deliberately left the engine's own
 * bookkeeping alone. Engage is meant to be completely separate, so these move
 * too - migration history, admin preferences, document locks and the KV store.
 *
 * The relationship COLUMNS that had to move with the collections are not
 * listed here. They are worked out from the database itself at run time, in
 * engineBootstrap.ts - see planRelsColumnRenames there for why.
 *
 * The matching config side lives in src/engage.config.ts, which sets `dbName`
 * on these four internal collections after the config is built. Both halves
 * have to move together: the names below are what the database gets, and the
 * config is what asks for them.
 */

import type { TableRename } from './applyRenames'

/**
 * Slug -> table name for the engine's internal collections. Mirrored exactly
 * by ENGINE_COLLECTION_TABLES in src/engage.config.ts - if you change one,
 * change the other, or the config will ask for a table that does not exist.
 */
export const ENGINE_COLLECTION_TABLES: Record<string, string> = {
  'payload-migrations': 'eg_migrations',
  'payload-preferences': 'eg_preferences',
  'payload-locked-documents': 'eg_locked_documents',
  'payload-kv': 'eg_kv',
}

/**
 * Parent tables first, then their `_rels` children. Order does not actually
 * matter (each pair is checked independently) but it reads better this way.
 */
export const ENGINE_TABLE_RENAMES: TableRename[] = [
  { from: 'payload_migrations', to: 'eg_migrations' },
  { from: 'payload_preferences', to: 'eg_preferences' },
  { from: 'payload_preferences_rels', to: 'eg_preferences_rels' },
  { from: 'payload_locked_documents', to: 'eg_locked_documents' },
  { from: 'payload_locked_documents_rels', to: 'eg_locked_documents_rels' },
  { from: 'payload_kv', to: 'eg_kv' },
]
