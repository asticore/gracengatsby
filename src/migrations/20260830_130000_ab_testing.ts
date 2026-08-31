import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Creates the A/B testing tables: the `eg_ab_tests` collection family, and the
// two tables the visitor path writes to.
//
// Written by hand rather than generated, for the same reason the members and
// backups migrations are: the CLI's `migrate` cannot reach production D1 from
// this CI environment (see the note on the D1 binding in wrangler.jsonc), so
// every statement has to be safe to replay against a database that may already
// have them. `CREATE TABLE IF NOT EXISTS` covers the tables; SQLite has no
// `ADD COLUMN IF NOT EXISTS`, so the one column add swallows the
// duplicate-column error instead - see `addColumn`.
//
// The column names here and the field names on the collection are two halves of
// one thing. Change one, change both.

const AB_TESTS = `CREATE TABLE IF NOT EXISTS \`eg_ab_tests\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`status\` text DEFAULT 'draft' NOT NULL,
  \`page_id\` integer NOT NULL,
  \`scope\` text DEFAULT 'page' NOT NULL,
  \`block_id\` text,
  \`target_path\` text,
  \`starts_at\` text,
  \`ends_at\` text,
  \`notes\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (\`page_id\`) REFERENCES \`eg_pages\`(\`id\`) ON UPDATE no action ON DELETE set null
)`

// The arms. A child table rather than JSON because that is what the engine's
// SQLite adapter generates for an `array` field - storing it any other way
// would make the collection and the schema disagree.
//
// `key` is the string written into every visitor cookie and every event row, so
// it is data, not presentation: the collection's beforeChange hook only ever
// fills blank keys and never renumbers existing ones.
const AB_TEST_VARIANTS = `CREATE TABLE IF NOT EXISTS \`eg_ab_tests_variants\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`key\` text,
  \`label\` text,
  \`weight\` numeric DEFAULT 50,
  \`is_control\` integer DEFAULT false,
  \`page_id\` integer,
  \`template_id\` integer,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_ab_tests\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`page_id\`) REFERENCES \`eg_pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (\`template_id\`) REFERENCES \`eg_page_templates\`(\`id\`) ON UPDATE no action ON DELETE set null
)`

const AB_TEST_GOALS = `CREATE TABLE IF NOT EXISTS \`eg_ab_tests_goals\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`key\` text,
  \`label\` text,
  \`type\` text DEFAULT 'page-visited',
  \`path\` text,
  \`selector\` text,
  \`form_id\` integer,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_ab_tests\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`form_id\`) REFERENCES \`eg_forms\`(\`id\`) ON UPDATE no action ON DELETE set null
)`

/**
 * The append-only log. One row per visitor per test at first sight, one per
 * visitor per goal at first conversion - never one per page view, which is the
 * difference between a few thousand writes a month and a few million.
 *
 * `test_id` is text rather than an integer foreign key on purpose. This table
 * is written from the request path with no join to the collection, and a
 * deleted test must not take its own history with it: a result you can no
 * longer explain is worse than an orphaned row.
 *
 * The unique index is the real dedupe. The visitor cookie stops the write from
 * being attempted twice, which is the cheap path; this is what holds when there
 * is no cookie to consult - a server-scored order, a cleared browser, a retry.
 */
const AB_EVENTS = `CREATE TABLE IF NOT EXISTS \`eg_ab_events\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`test_id\` text NOT NULL,
  \`variant_key\` text NOT NULL,
  \`goal_key\` text DEFAULT '' NOT NULL,
  \`visitor_id\` text NOT NULL,
  \`value\` numeric DEFAULT 0 NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

/**
 * The rollup the results screen reads: one row per (test, variant, goal), so a
 * three-arm test with four goals is fifteen rows however many visitors it has
 * seen. Without it, opening the results screen would aggregate the whole log.
 *
 * `goal_key` is '' on the impression row rather than NULL, because SQLite
 * treats NULLs as distinct in a unique constraint and every impression would
 * then insert a new row instead of incrementing the existing one.
 */
const AB_STATS = `CREATE TABLE IF NOT EXISTS \`eg_ab_stats\` (
  \`test_id\` text NOT NULL,
  \`variant_key\` text NOT NULL,
  \`goal_key\` text DEFAULT '' NOT NULL,
  \`visitors\` integer DEFAULT 0 NOT NULL,
  \`conversions\` integer DEFAULT 0 NOT NULL,
  \`value_total\` numeric DEFAULT 0 NOT NULL,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  PRIMARY KEY (\`test_id\`, \`variant_key\`, \`goal_key\`)
)`

// Every index here answers a query the feature actually makes: the manifest
// filters by status on every cold isolate; the edge matches a request by target
// path; the results screen reads the rollup by test; and the events log is
// searched by test when somebody wants to re-check a number by hand.
const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_status_idx` ON `eg_ab_tests` (`status`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_page_idx` ON `eg_ab_tests` (`page_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_target_path_idx` ON `eg_ab_tests` (`target_path`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_updated_at_idx` ON `eg_ab_tests` (`updated_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_created_at_idx` ON `eg_ab_tests` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_variants_order_idx` ON `eg_ab_tests_variants` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_variants_parent_id_idx` ON `eg_ab_tests_variants` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_goals_order_idx` ON `eg_ab_tests_goals` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_tests_goals_parent_id_idx` ON `eg_ab_tests_goals` (`_parent_id`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_ab_events_unique_idx` ON `eg_ab_events` (`test_id`, `variant_key`, `goal_key`, `visitor_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_events_test_created_idx` ON `eg_ab_events` (`test_id`, `created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_ab_stats_test_idx` ON `eg_ab_stats` (`test_id`)',
]

type Runner = MigrateUpArgs['db']

/**
 * Adds a column, treating "it is already there" as success.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and this migration has to be safe
 * to replay - production runs it through an HTTP endpoint that can be called
 * twice. Only the duplicate-column error is swallowed; anything else still
 * fails the migration, because a silently skipped schema change is how a table
 * ends up half-built with nobody knowing.
 */
const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

export async function up({ db, payload: engine }: MigrateUpArgs): Promise<void> {
  for (const statement of [AB_TESTS, AB_TEST_VARIANTS, AB_TEST_GOALS, AB_EVENTS, AB_STATS]) {
    await db.run(sql.raw(statement))
  }
  for (const statement of INDEXES) {
    await db.run(sql.raw(statement))
  }

  // Every registered collection needs a column here or the admin's document
  // locking fails on the first edit - the join table is one wide row of
  // per-collection foreign keys and the engine writes to whichever one matches.
  await addColumn(db, 'eg_locked_documents_rels', 'eg_ab_tests_id', 'integer')
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_ab_tests_id_idx` ON `eg_locked_documents_rels` (`eg_ab_tests_id`)',
    ),
  )

  engine.logger.info('[migrate] eg_ab_tests, eg_ab_events and eg_ab_stats are present.')
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping these tables on a
  // rollback would delete the measurements a test was run to collect, which is
  // the one thing that cannot be reconstructed afterwards - the visitors have
  // been and gone.
  engine.logger.info('[migrate] Down is a no-op - the A/B testing tables are left in place.')
}
