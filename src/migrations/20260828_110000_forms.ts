import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Creates the tables behind the Forms feature: `eg_forms` and its two child
// arrays, `eg_form_submissions`, the per-parent block tables for the Form
// page-builder block, and the relationship columns that block needs.
//
// Written by hand rather than generated, like the security and settings
// migrations before it. The generator is not usable on this project: the CLI
// cannot reach production D1 from CI (see the note on the D1 binding in
// wrangler.jsonc), and its stored snapshot still describes the pre-`eg_` table
// names, so `migrate:create` opens an interactive rename prompt for every table
// in the database rather than emitting the handful of statements wanted here.
// The statements below were written against the live local schema, matching the
// adapter's own naming exactly - group fields flattened to `<group>_<field>`,
// array children in `<parent>_<array>`, block rows in
// `<parent>_blocks_<block>` with a `_v` twin wherever the parent has drafts.
//
// Everything is replayable: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
// EXISTS`, and - since SQLite has no `ADD COLUMN IF NOT EXISTS` - each added
// column checked against PRAGMA table_info first.
//
// The column names here and the field names on the two collections are two
// halves of one thing. Change one, change the other.

const FORMS = `CREATE TABLE IF NOT EXISTS \`eg_forms\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`title\` text NOT NULL,
  \`settings_submit_button_label\` text,
  \`settings_success_message\` text,
  \`settings_error_message\` text,
  \`settings_redirect_url\` text,
  \`notification_enabled\` integer DEFAULT true,
  \`notification_recipients\` text,
  \`notification_subject\` text,
  \`notification_message\` text,
  \`confirmation_enabled\` integer DEFAULT false,
  \`confirmation_to_field\` text,
  \`confirmation_subject\` text,
  \`confirmation_message\` text,
  \`spam_honeypot\` text DEFAULT 'inherit',
  \`spam_minimum_fill_time\` text DEFAULT 'inherit',
  \`spam_turnstile\` text DEFAULT 'inherit',
  \`payment_purchasable\` integer DEFAULT false,
  \`payment_base_price\` numeric,
  \`payment_currency\` text DEFAULT 'AUD',
  \`payment_total_field\` text,
  \`payment_product_id\` integer REFERENCES "eg_products"(\`id\`),
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

// `id` is text, not integer: array rows are keyed by the engine's own generated
// row id rather than by an autoincrement, which is what lets a row keep its
// identity when the array is reordered.
const FORMS_FIELDS = `CREATE TABLE IF NOT EXISTS \`eg_forms_fields\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`type\` text DEFAULT 'text' NOT NULL,
  \`width\` text DEFAULT 'full',
  \`label\` text,
  \`name\` text,
  \`required\` integer DEFAULT false,
  \`placeholder\` text,
  \`default_value\` text,
  \`help_text\` text,
  \`min\` numeric,
  \`max\` numeric,
  \`accept\` text,
  \`html\` text,
  \`calculation_formula\` text,
  \`calculation_decimal_places\` numeric DEFAULT 2,
  \`calculation_prefix\` text,
  \`calculation_suffix\` text,
  \`pricing_priced\` integer DEFAULT false,
  \`pricing_amount\` numeric,
  \`pricing_unit_price\` numeric,
  \`conditional_enabled\` integer DEFAULT false,
  \`conditional_action\` text DEFAULT 'show',
  \`conditional_match\` text DEFAULT 'all',
  FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_forms"(\`id\`) ON UPDATE no action ON DELETE cascade
)`

const FORMS_FIELDS_OPTIONS = `CREATE TABLE IF NOT EXISTS \`eg_forms_fields_options\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` text NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`label\` text NOT NULL,
  \`value\` text NOT NULL,
  \`price\` numeric,
  FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_forms_fields"(\`id\`) ON UPDATE no action ON DELETE cascade
)`

const FORMS_FIELDS_RULES = `CREATE TABLE IF NOT EXISTS \`eg_forms_fields_conditional_rules\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` text NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`field\` text NOT NULL,
  \`operator\` text DEFAULT 'equals',
  \`value\` text,
  FOREIGN KEY (\`_parent_id\`) REFERENCES "eg_forms_fields"(\`id\`) ON UPDATE no action ON DELETE cascade
)`

// `values` and `line_items` are JSON, which this adapter stores as TEXT. An
// entry's shape is whatever the form said it was on the day it was submitted,
// so it cannot be columns - see the note on the collection.
const SUBMISSIONS = `CREATE TABLE IF NOT EXISTS \`eg_form_submissions\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`form_id\` integer NOT NULL,
  \`summary\` text,
  \`values\` text NOT NULL,
  \`submitted_at\` text,
  \`ip\` text,
  \`user_agent\` text,
  \`total\` numeric,
  \`currency\` text,
  \`payment_status\` text DEFAULT 'none',
  \`line_items\` text,
  \`notification_status\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (\`form_id\`) REFERENCES "eg_forms"(\`id\`) ON UPDATE no action ON DELETE set null
)`

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `forms_updated_at_idx` ON `eg_forms` (`updated_at`)',
  'CREATE INDEX IF NOT EXISTS `forms_created_at_idx` ON `eg_forms` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `forms_fields_order_idx` ON `eg_forms_fields` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `forms_fields_parent_id_idx` ON `eg_forms_fields` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `forms_fields_options_order_idx` ON `eg_forms_fields_options` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `forms_fields_options_parent_id_idx` ON `eg_forms_fields_options` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `forms_fields_conditional_rules_order_idx` ON `eg_forms_fields_conditional_rules` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `forms_fields_conditional_rules_parent_id_idx` ON `eg_forms_fields_conditional_rules` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `form_submissions_updated_at_idx` ON `eg_form_submissions` (`updated_at`)',
  'CREATE INDEX IF NOT EXISTS `form_submissions_created_at_idx` ON `eg_form_submissions` (`created_at`)',
  // The two queries the admin list and the CSV export actually run: entries for
  // one form, newest first in the list and oldest first in the export.
  'CREATE INDEX IF NOT EXISTS `form_submissions_form_idx` ON `eg_form_submissions` (`form_id`)',
  'CREATE INDEX IF NOT EXISTS `form_submissions_submitted_at_idx` ON `eg_form_submissions` (`submitted_at`)',
]

/**
 * Every parent that can hold a page-builder block, and whether its block rows
 * use a text id (the live document) or an integer id plus `_uuid` (a draft
 * version). Page Templates and the three settings globals have no drafts, so
 * they have no `_v` twin.
 */
const BLOCK_PARENTS: { table: string; parent: string; versioned: boolean }[] = [
  { table: 'eg_pages_blocks_form', parent: 'eg_pages', versioned: false },
  { table: '_eg_pages_v_blocks_form', parent: '_eg_pages_v', versioned: true },
  { table: 'eg_posts_blocks_form', parent: 'eg_posts', versioned: false },
  { table: '_eg_posts_v_blocks_form', parent: '_eg_posts_v', versioned: true },
  { table: 'eg_products_blocks_form', parent: 'eg_products', versioned: false },
  { table: '_eg_products_v_blocks_form', parent: '_eg_products_v', versioned: true },
  { table: 'eg_page_templates_blocks_form', parent: 'eg_page_templates', versioned: false },
  { table: 'eg_blog_settings_blocks_form', parent: 'eg_blog_settings', versioned: false },
  { table: 'eg_faq_settings_blocks_form', parent: 'eg_faq_settings', versioned: false },
  { table: 'eg_shop_settings_blocks_form', parent: 'eg_shop_settings', versioned: false },
]

// The block's `form` relationship is not stored here - it lives in the parent's
// `_rels` table, which is why the columns below stop at the block's own fields.
const blockTable = ({ table, parent, versioned }: (typeof BLOCK_PARENTS)[number]): string =>
  `CREATE TABLE IF NOT EXISTS \`${table}\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`_path\` text NOT NULL,
  \`id\` ${versioned ? 'integer' : 'text'} PRIMARY KEY NOT NULL,
  \`heading\` text,
  \`show_title\` integer DEFAULT true,
  \`intro\` text,
  ${versioned ? '`_uuid` text,\n  ' : ''}\`block_name\` text,
  \`design\` text,
  FOREIGN KEY (\`_parent_id\`) REFERENCES "${parent}"(\`id\`) ON UPDATE no action ON DELETE cascade
)`

/**
 * Where the Form block's chosen form is actually stored.
 *
 * A relationship inside a block goes into the owning document's `_rels` table
 * as one column per target collection, so every parent that can hold the block
 * needs an `eg_forms_id`. `eg_locked_documents_rels` gets columns for both new
 * collections instead, because that is how the admin area records who has a
 * document open.
 */
const RELS_TABLES = [
  'eg_pages_rels',
  '_eg_pages_v_rels',
  'eg_posts_rels',
  '_eg_posts_v_rels',
  'eg_products_rels',
  '_eg_products_v_rels',
  'eg_page_templates_rels',
  'eg_blog_settings_rels',
  'eg_faq_settings_rels',
  'eg_shop_settings_rels',
]

export async function up({ db, payload: engine }: MigrateUpArgs): Promise<void> {
  const exists = async (table: string): Promise<boolean> => {
    const rows = (await db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
    )) as { name: string }[]
    return rows.length > 0
  }

  const columnsOf = async (table: string): Promise<Set<string>> => {
    if (!(await exists(table))) return new Set()
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return new Set(rows.map((row) => row.name))
  }

  const addColumn = async (table: string, column: string, definition: string): Promise<boolean> => {
    const columns = await columnsOf(table)
    if (columns.size === 0 || columns.has(column)) return false
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD ${definition}`))
    return true
  }

  for (const statement of [FORMS, FORMS_FIELDS, FORMS_FIELDS_OPTIONS, FORMS_FIELDS_RULES, SUBMISSIONS]) {
    await db.run(sql.raw(statement))
  }
  for (const statement of INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_forms and eg_form_submissions are present.')

  // A parent table that does not exist yet belongs to a feature whose own
  // migration has not run. Skip it rather than failing the chain - the block
  // simply has nowhere to be placed until then, and a later run picks it up.
  const skipped: string[] = []
  for (const entry of BLOCK_PARENTS) {
    if (!(await exists(entry.parent))) {
      skipped.push(entry.parent)
      continue
    }
    await db.run(sql.raw(blockTable(entry)))
    await db.run(
      sql.raw(`CREATE INDEX IF NOT EXISTS \`${entry.table}_order_idx\` ON \`${entry.table}\` (\`_order\`)`),
    )
    await db.run(
      sql.raw(
        `CREATE INDEX IF NOT EXISTS \`${entry.table}_parent_id_idx\` ON \`${entry.table}\` (\`_parent_id\`)`,
      ),
    )
    await db.run(
      sql.raw(`CREATE INDEX IF NOT EXISTS \`${entry.table}_path_idx\` ON \`${entry.table}\` (\`_path\`)`),
    )
  }

  const added: string[] = []
  for (const table of RELS_TABLES) {
    if (await addColumn(table, 'eg_forms_id', '`eg_forms_id` integer REFERENCES "eg_forms"(id)')) {
      added.push(`${table}.eg_forms_id`)
    }
  }

  if (await addColumn('eg_locked_documents_rels', 'eg_forms_id', '`eg_forms_id` integer REFERENCES "eg_forms"(id)')) {
    added.push('eg_locked_documents_rels.eg_forms_id')
  }
  if (
    await addColumn(
      'eg_locked_documents_rels',
      'eg_form_submissions_id',
      '`eg_form_submissions_id` integer REFERENCES "eg_form_submissions"(id)',
    )
  ) {
    added.push('eg_locked_documents_rels.eg_form_submissions_id')
  }

  if (added.length > 0) engine.logger.info(`[migrate] Added: ${added.join(', ')}`)
  if (skipped.length > 0) {
    engine.logger.warn(`[migrate] Form block tables skipped - no parent table yet: ${skipped.join(', ')}`)
  }
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. A rollback that dropped these
  // would take every enquiry the site has ever received with it, and the Forms
  // feature toggle already hides the whole thing without deleting anything.
  engine.logger.info('[migrate] Down is a no-op - form tables and entries are left in place.')
}
