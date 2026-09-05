import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates the Members feature's tables - `eg_membership_tiers` (plus its
// benefits child table) and `eg_memberships` - and adds the members-only gate
// columns to Pages and Posts.
//
// Written by hand rather than generated, for the same reason the backups and
// audit-log migrations are: the CLI's `migrate` cannot reach production D1 from
// this CI environment (see the note on the D1 binding in wrangler.jsonc), so
// every statement has to be safe to replay against a database that may already
// have them. `CREATE TABLE IF NOT EXISTS` covers the tables; SQLite has no
// `ADD COLUMN IF NOT EXISTS`, so the column adds swallow the duplicate-column
// error instead - see `addColumn`.
//
// The column names here and the field names on the two collections are two
// halves of one thing. Change one, change both.

const MEMBERSHIP_TIERS = `CREATE TABLE IF NOT EXISTS \`eg_membership_tiers\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`active\` integer DEFAULT true,
  \`slug\` text,
  \`rank\` numeric DEFAULT 1 NOT NULL,
  \`price\` numeric DEFAULT 0,
  \`interval\` text DEFAULT 'monthly',
  \`trial_days\` numeric DEFAULT 0,
  \`description\` text,
  \`stripe_price_id\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

// The bullet list under a tier. A child table rather than JSON because that is
// what the engine's SQLite adapter generates for an `array` field - storing it
// any other way would make the collection and the schema disagree.
const MEMBERSHIP_TIER_BENEFITS = `CREATE TABLE IF NOT EXISTS \`eg_membership_tiers_benefits\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`benefit\` text,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_membership_tiers\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`

// `user_id` is not unique: a person can cancel and rejoin, so they accumulate
// rows over time and the gate picks the highest-ranked one that still grants
// access. A unique constraint here would block the second sign-up outright.
const MEMBERSHIPS = `CREATE TABLE IF NOT EXISTS \`eg_memberships\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`user_id\` integer NOT NULL,
  \`tier_id\` integer NOT NULL,
  \`status\` text DEFAULT 'pending' NOT NULL,
  \`started_at\` text,
  \`renews_at\` text,
  \`trial_ends_at\` text,
  \`cancelled_at\` text,
  \`cancel_at_period_end\` integer DEFAULT false,
  \`external_subscription_id\` text,
  \`external_customer_id\` text,
  \`welcome_email_sent_at\` text,
  \`expiry_reminder_sent_at\` text,
  \`notes\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (\`user_id\`) REFERENCES \`eg_users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (\`tier_id\`) REFERENCES \`eg_membership_tiers\`(\`id\`) ON UPDATE no action ON DELETE set null
)`

// Every index here answers a query the feature actually makes: the gate looks
// memberships up by user; the reminder sweep scans by status and renewal date;
// the Stripe webhooks find a row by subscription id, on every event, and
// without that index that lookup is a full scan of the table on the hot path of
// a webhook that has to answer inside Stripe's timeout.
const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_membership_tiers_slug_idx` ON `eg_membership_tiers` (`slug`)',
  'CREATE INDEX IF NOT EXISTS `eg_membership_tiers_rank_idx` ON `eg_membership_tiers` (`rank`)',
  'CREATE INDEX IF NOT EXISTS `eg_membership_tiers_updated_at_idx` ON `eg_membership_tiers` (`updated_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_membership_tiers_created_at_idx` ON `eg_membership_tiers` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_membership_tiers_benefits_order_idx` ON `eg_membership_tiers_benefits` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_membership_tiers_benefits_parent_id_idx` ON `eg_membership_tiers_benefits` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_memberships_user_idx` ON `eg_memberships` (`user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_memberships_tier_idx` ON `eg_memberships` (`tier_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_memberships_status_idx` ON `eg_memberships` (`status`)',
  'CREATE INDEX IF NOT EXISTS `eg_memberships_renews_at_idx` ON `eg_memberships` (`renews_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_memberships_external_subscription_id_idx` ON `eg_memberships` (`external_subscription_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_memberships_updated_at_idx` ON `eg_memberships` (`updated_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_memberships_created_at_idx` ON `eg_memberships` (`created_at`)',
]

/**
 * The gate field on Pages and Posts.
 *
 * Both collections keep drafts, so each has a `_..._v` shadow table whose
 * columns carry a `version_` prefix. Missing those would make a page look
 * ungated in every draft and preview - which is to say, unlocked for anyone who
 * can reach a preview URL.
 *
 * The tier column deliberately has no foreign key. SQLite can only add a column
 * with a REFERENCES clause when the referenced table already exists at that
 * moment, and on a fresh database this migration and the collections land
 * together; the engine enforces the relationship on write regardless, and a
 * dangling id is treated as "no tier named", which the gate handles by falling
 * back to "any member" rather than by opening the document.
 */
const GATE_COLUMNS: { table: string; column: string; type: string }[] = [
  { table: 'eg_pages', column: 'members_only_enabled', type: 'integer DEFAULT false' },
  { table: 'eg_pages', column: 'members_only_tier_id', type: 'integer' },
  { table: '_eg_pages_v', column: 'version_members_only_enabled', type: 'integer DEFAULT false' },
  { table: '_eg_pages_v', column: 'version_members_only_tier_id', type: 'integer' },
  { table: 'eg_posts', column: 'members_only_enabled', type: 'integer DEFAULT false' },
  { table: 'eg_posts', column: 'members_only_tier_id', type: 'integer' },
  { table: '_eg_posts_v', column: 'version_members_only_enabled', type: 'integer DEFAULT false' },
  { table: '_eg_posts_v', column: 'version_members_only_tier_id', type: 'integer' },
]

const GATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_pages_members_only_members_only_enabled_idx` ON `eg_pages` (`members_only_enabled`)',
  'CREATE INDEX IF NOT EXISTS `eg_pages_members_only_members_only_tier_idx` ON `eg_pages` (`members_only_tier_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_posts_members_only_members_only_enabled_idx` ON `eg_posts` (`members_only_enabled`)',
  'CREATE INDEX IF NOT EXISTS `eg_posts_members_only_members_only_tier_idx` ON `eg_posts` (`members_only_tier_id`)',
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
  for (const statement of [MEMBERSHIP_TIERS, MEMBERSHIP_TIER_BENEFITS, MEMBERSHIPS]) {
    await db.run(sql.raw(statement))
  }
  for (const statement of INDEXES) {
    await db.run(sql.raw(statement))
  }

  for (const { table, column, type } of GATE_COLUMNS) {
    await addColumn(db, table, column, type)
  }
  for (const statement of GATE_INDEXES) {
    await db.run(sql.raw(statement))
  }

  engine.logger.info('[migrate] eg_membership_tiers and eg_memberships are present, and the gate columns are on Pages and Posts.')
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping these tables on a
  // rollback would delete the record of who has paid for what, which is the one
  // thing that cannot be reconstructed from the site itself.
  engine.logger.info('[migrate] Down is a no-op - the membership tables are left in place.')
}
