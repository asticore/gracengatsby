import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

/**
 * Creates three custom tables for content visibility control:
 *   - eg_content_passwords: per-document password protection
 *   - eg_scheduled_publishes: scheduled publish/unpublish dates
 *   - eg_edit_locks: optimistic locking during collaborative editing
 *
 * Also adds six SEO columns to eg_events and _eg_events_v (version_ prefix).
 * Safe to replay: CREATE TABLE IF NOT EXISTS and idempotent addColumn guards.
 */

const TABLES = [
  `CREATE TABLE IF NOT EXISTS \`eg_content_passwords\` (
    \`collection\` text NOT NULL,
    \`doc_id\` integer NOT NULL,
    \`hash\` text NOT NULL,
    \`updated_at\` text NOT NULL,
    PRIMARY KEY (\`collection\`, \`doc_id\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`eg_scheduled_publishes\` (
    \`collection\` text NOT NULL,
    \`doc_id\` integer NOT NULL,
    \`publish_at\` text,
    \`unpublish_at\` text,
    \`publish_done\` integer NOT NULL DEFAULT 0,
    \`unpublish_done\` integer NOT NULL DEFAULT 0,
    \`updated_at\` text NOT NULL,
    PRIMARY KEY (\`collection\`, \`doc_id\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`eg_edit_locks\` (
    \`collection\` text NOT NULL,
    \`doc_id\` integer NOT NULL,
    \`user_id\` integer NOT NULL,
    \`user_label\` text NOT NULL,
    \`heartbeat_at\` integer NOT NULL,
    PRIMARY KEY (\`collection\`, \`doc_id\`)
  )`,
]

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_scheduled_publishes_publish_at_idx` ON `eg_scheduled_publishes` (`publish_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_scheduled_publishes_unpublish_at_idx` ON `eg_scheduled_publishes` (`unpublish_at`)',
]

/** SEO columns added to products in 20261002_120000, now added to events */
const SEO_COLUMNS = [
  { column: 'seo_meta_title', sql: `ALTER TABLE \`eg_events\` ADD \`seo_meta_title\` text` },
  { column: 'seo_meta_description', sql: `ALTER TABLE \`eg_events\` ADD \`seo_meta_description\` text` },
  { column: 'seo_no_index', sql: `ALTER TABLE \`eg_events\` ADD \`seo_no_index\` integer DEFAULT false` },
  { column: 'seo_og_image_id', sql: `ALTER TABLE \`eg_events\` ADD \`seo_og_image_id\` integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null` },
  { column: 'seo_canonical_url', sql: `ALTER TABLE \`eg_events\` ADD \`seo_canonical_url\` text` },
  { column: 'seo_no_follow', sql: `ALTER TABLE \`eg_events\` ADD \`seo_no_follow\` integer DEFAULT false` },
  { column: 'seo_social_title', sql: `ALTER TABLE \`eg_events\` ADD \`seo_social_title\` text` },
  { column: 'seo_social_description', sql: `ALTER TABLE \`eg_events\` ADD \`seo_social_description\` text` },
  { column: 'seo_x_card', sql: `ALTER TABLE \`eg_events\` ADD \`seo_x_card\` text DEFAULT 'summary_large_image'` },
  { column: 'seo_x_image_id', sql: `ALTER TABLE \`eg_events\` ADD \`seo_x_image_id\` integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null` },
]

const SEO_VERSION_COLUMNS = [
  { column: 'version_seo_meta_title', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_meta_title\` text` },
  { column: 'version_seo_meta_description', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_meta_description\` text` },
  { column: 'version_seo_no_index', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_no_index\` integer DEFAULT false` },
  { column: 'version_seo_og_image_id', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_og_image_id\` integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null` },
  { column: 'version_seo_canonical_url', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_canonical_url\` text` },
  { column: 'version_seo_no_follow', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_no_follow\` integer DEFAULT false` },
  { column: 'version_seo_social_title', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_social_title\` text` },
  { column: 'version_seo_social_description', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_social_description\` text` },
  { column: 'version_seo_x_card', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_x_card\` text DEFAULT 'summary_large_image'` },
  { column: 'version_seo_x_image_id', sql: `ALTER TABLE \`_eg_events_v\` ADD \`version_seo_x_image_id\` integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null` },
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const exists = async (table: string): Promise<boolean> => {
    const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as { name: string }[]
    return rows.length > 0
  }

  const columnsOf = async (table: string): Promise<string[]> => {
    if (!(await exists(table))) return []
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.map((row) => row.name)
  }

  // ---- Three custom control tables ----
  for (const statement of TABLES) {
    await db.run(sql.raw(statement))
  }

  // ---- Indexes for scheduled publishes ----
  for (const statement of INDEXES) {
    await db.run(sql.raw(statement))
  }

  engine.logger.info('[migrate] eg_content_passwords, eg_scheduled_publishes, eg_edit_locks created.')

  // ---- Events: SEO columns ----
  if (await exists('eg_events')) {
    const existing = new Set(await columnsOf('eg_events'))
    const added: string[] = []

    for (const entry of SEO_COLUMNS) {
      if (existing.has(entry.column)) continue
      await db.run(sql.raw(entry.sql))
      added.push(entry.column)
    }

    if (added.length > 0) {
      engine.logger.info(`[migrate] Added to eg_events: ${added.join(', ')}`)
    }
  }

  if (await exists('_eg_events_v')) {
    const existing = new Set(await columnsOf('_eg_events_v'))
    const added: string[] = []

    for (const entry of SEO_VERSION_COLUMNS) {
      if (existing.has(entry.column)) continue
      await db.run(sql.raw(entry.sql))
      added.push(entry.column)
    }

    if (added.length > 0) {
      engine.logger.info(`[migrate] Added to _eg_events_v: ${added.join(', ')}`)
    }
  }
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping these tables and columns
  // would destroy configuration (scheduled publishes) and event metadata that has
  // been carefully configured.
  engine.logger.info('[migrate] Down is a no-op - the tables and columns are left in place.')
}
