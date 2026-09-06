-- Schema drift repair, not yet applied to the remote/production D1 database.
--
-- eg_locked_documents_rels (Payload's own polymorphic "who has this document
-- locked" table) is missing FK columns for every collection added to this
-- app's config after that table was last migrated: audit-log, backups,
-- translations, membership-tiers, memberships. checkDocumentLockStatus's own
-- query touches every collection slug unconditionally, so on the LOCAL dev
-- D1 this made every Payload update()/delete() call against a lockable
-- collection fail outright with "no such column: ...eg_audit_log_id" -
-- confirmed by inspecting the real local CREATE TABLE statement, not
-- guessed. Applied locally already (see tests/int/scratch-fix-schema.int.spec.ts,
-- deleted after use) to unblock draft/publish parity testing in
-- src/cms/db - see tests/int/cms-db-events-drafts.int.spec.ts.
--
-- NOT yet run against the remote/production D1 database - if this app's real
-- admin UI hits the same update/delete path on a lockable collection in
-- production, it would hit the exact same error there. Run this file with
-- `wrangler d1 execute D1 --file=... --env=production --remote` (same
-- pattern as the other files in this directory) to apply it for real, once
-- someone has confirmed that's wanted.
ALTER TABLE `eg_locked_documents_rels` ADD COLUMN `eg_audit_log_id` integer REFERENCES `eg_audit_log`(id);
ALTER TABLE `eg_locked_documents_rels` ADD COLUMN `eg_backups_id` integer REFERENCES `eg_backups`(id);
ALTER TABLE `eg_locked_documents_rels` ADD COLUMN `eg_translations_id` integer REFERENCES `eg_translations`(id);
ALTER TABLE `eg_locked_documents_rels` ADD COLUMN `eg_membership_tiers_id` integer REFERENCES `eg_membership_tiers`(id);
ALTER TABLE `eg_locked_documents_rels` ADD COLUMN `eg_memberships_id` integer REFERENCES `eg_memberships`(id);
