/**
 * Schema addition for `eg_locked_documents_rels` (Payload's own polymorphic
 * "who has this document locked" table): FK columns for every collection
 * added to this app's config after that table was last migrated - audit-log,
 * backups, translations, membership-tiers, memberships. Without these,
 * `checkDocumentLockStatus`'s own query (which touches every collection slug
 * unconditionally) fails with "no such column" on update/delete for any of
 * those five collections.
 *
 * Hand-written, not generated - unlike builderSchema.ts/settingsSchema.ts.
 * This replaces a plain SQL file
 * (`src/migrations/sql/20260906_000000_fix_locked_documents_rels_missing_columns.sql`,
 * now deleted) that briefly lived in `deploy:database` and broke every deploy
 * with "duplicate column name: eg_audit_log_id" - production already had
 * these columns by the time that file was wired in (added by hand at some
 * earlier point, undocumented), and a plain `ALTER TABLE ADD COLUMN` has no
 * `IF NOT EXISTS` form in SQLite, so re-running it hard-failed instead of
 * silently doing nothing.
 *
 * Routed through `applySchemaAdditions` instead, which checks `PRAGMA
 * table_info` before each column add (see applySchema.ts) - a no-op on the
 * current production database (all five columns already exist there), and
 * closing the real gap on a genuinely fresh install, where the base
 * migrations create this table without them (none of the migrations that
 * added these five collections to the config also touched this table).
 */

import type { SchemaColumn } from './builderSchema'

export const LOCKED_DOCUMENTS_RELS_COLUMNS: SchemaColumn[] = [
  {
    table: 'eg_locked_documents_rels',
    column: 'eg_audit_log_id',
    sql: 'ALTER TABLE `eg_locked_documents_rels` ADD `eg_audit_log_id` INTEGER REFERENCES `eg_audit_log`(`id`)',
  },
  {
    table: 'eg_locked_documents_rels',
    column: 'eg_backups_id',
    sql: 'ALTER TABLE `eg_locked_documents_rels` ADD `eg_backups_id` INTEGER REFERENCES `eg_backups`(`id`)',
  },
  {
    table: 'eg_locked_documents_rels',
    column: 'eg_translations_id',
    sql: 'ALTER TABLE `eg_locked_documents_rels` ADD `eg_translations_id` INTEGER REFERENCES `eg_translations`(`id`)',
  },
  {
    table: 'eg_locked_documents_rels',
    column: 'eg_membership_tiers_id',
    sql: 'ALTER TABLE `eg_locked_documents_rels` ADD `eg_membership_tiers_id` INTEGER REFERENCES `eg_membership_tiers`(`id`)',
  },
  {
    table: 'eg_locked_documents_rels',
    column: 'eg_memberships_id',
    sql: 'ALTER TABLE `eg_locked_documents_rels` ADD `eg_memberships_id` INTEGER REFERENCES `eg_memberships`(`id`)',
  },
]
