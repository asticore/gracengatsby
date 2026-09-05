import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_translations`, the single table behind the Multilingual feature.
//
// One table, additive, no change to any existing one - which is the whole
// argument for this storage shape over the engine's native localization. Native
// localization would restructure most of the schema (a sibling `<table>_locales`
// for every localised collection) on every install, including the great majority
// that will never switch multilingual on. This runs on those installs too, but
// it adds an empty table and touches nothing else, so a site with the feature
// off is indistinguishable from one that never had this migration.
//
// Written by hand rather than generated, for the same reason as the migrations
// around it: the CLI's `migrate` cannot reach production D1 from this CI
// environment (see the note on the D1 binding in wrangler.jsonc), so every
// statement has to be safe to replay against a database that may already have
// some of them.
//
// The column names here and the field names on the translations collection are
// two halves of one thing - the collection reads this table directly. Change
// one, change the other.

const TRANSLATIONS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_translations\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`locale\` text NOT NULL,
  \`source_kind\` text NOT NULL,
  \`source_id\` text NOT NULL,
  \`field_path\` text NOT NULL,
  \`value\` text,
  \`source_text\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

const TRANSLATIONS_INDEXES = [
  // The uniqueness rule of the whole feature: one row per string per language.
  // Enforced here rather than only in the save path, because the save path is
  // find-then-write and two translators saving the same cell at the same
  // moment would otherwise leave two rows and a coin toss over which one the
  // site renders.
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_translations_key_idx` ON `eg_translations` (`locale`, `source_kind`, `source_id`, `field_path`)',
  // The front end's read is "everything for this language", and the admin
  // screen's is "everything for this document" - one index each, and no
  // others, since rows are written by hand a few at a time and read on every
  // page render.
  'CREATE INDEX IF NOT EXISTS `eg_translations_locale_idx` ON `eg_translations` (`locale`)',
  'CREATE INDEX IF NOT EXISTS `eg_translations_source_idx` ON `eg_translations` (`source_kind`, `source_id`)',
]

export async function up({ db, payload: engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TRANSLATIONS_TABLE))
  for (const statement of TRANSLATIONS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_translations is present.')
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping the table would throw
  // away every translation anybody has typed, and a rollback of the code that
  // reads them is not a reason to destroy the work - the table is inert while
  // the feature is off.
  engine.logger.info('[migrate] Down is a no-op - eg_translations is left in place.')
}
