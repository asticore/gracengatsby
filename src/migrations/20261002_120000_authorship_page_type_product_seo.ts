import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Adds authorship tracking (created_by_id, updated_by_id), schema_type classification,
// and additional SEO/social fields to products (to match pages/posts SEO coverage).
//
// Written to be safe to replay, for the same reason the backups and forms migrations
// are: the CLI cannot reach production D1 from this CI environment (see the note on
// the D1 binding in wrangler.jsonc), so every statement has to survive running against
// a database that already has it. Tables and indexes use IF NOT EXISTS; SQLite has no
// `ADD COLUMN IF NOT EXISTS`, so the column adds swallow the duplicate-column error
// instead - see `addColumn`.

type Runner = MigrateUpArgs['db']

/**
 * Adds a column, treating "it is already there" as success.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and this migration has to be safe to replay.
 * Only the duplicate-column error is swallowed; anything else still fails the migration.
 */
const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

/**
 * Check if a table exists in the database.
 */
const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
  )) as { name: string }[]
  return rows.length > 0
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  // ---- Pages: authorship and schema_type ----
  if (await tableExists(db, 'eg_pages')) {
    await addColumn(db, 'eg_pages', 'created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_pages', 'updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_pages', 'schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_pages_created_by_idx` ON `eg_pages` (`created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_pages_updated_by_idx` ON `eg_pages` (`updated_by_id`)'))
  }

  if (await tableExists(db, '_eg_pages_v')) {
    await addColumn(db, '_eg_pages_v', 'version_created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_pages_v', 'version_updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_pages_v', 'version_schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_pages_v_version_created_by_idx` ON `_eg_pages_v` (`version_created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_pages_v_version_updated_by_idx` ON `_eg_pages_v` (`version_updated_by_id`)'))
  }

  // ---- Posts: authorship and schema_type ----
  if (await tableExists(db, 'eg_posts')) {
    await addColumn(db, 'eg_posts', 'created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_posts', 'updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_posts', 'schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_posts_created_by_idx` ON `eg_posts` (`created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_posts_updated_by_idx` ON `eg_posts` (`updated_by_id`)'))
  }

  if (await tableExists(db, '_eg_posts_v')) {
    await addColumn(db, '_eg_posts_v', 'version_created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_posts_v', 'version_updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_posts_v', 'version_schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_posts_v_version_created_by_idx` ON `_eg_posts_v` (`version_created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_posts_v_version_updated_by_idx` ON `_eg_posts_v` (`version_updated_by_id`)'))
  }

  // ---- Products: authorship, schema_type, and additional SEO/social fields ----
  if (await tableExists(db, 'eg_products')) {
    await addColumn(db, 'eg_products', 'created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_products', 'updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_products', 'schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_products_created_by_idx` ON `eg_products` (`created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_products_updated_by_idx` ON `eg_products` (`updated_by_id`)'))
    // Additional SEO/social fields to match pages/posts coverage
    await addColumn(db, 'eg_products', 'seo_canonical_url', 'text')
    await addColumn(db, 'eg_products', 'seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, 'eg_products', 'seo_social_title', 'text')
    await addColumn(db, 'eg_products', 'seo_social_description', 'text')
    await addColumn(db, 'eg_products', 'seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, 'eg_products', 'seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_products_seo_x_image_idx` ON `eg_products` (`seo_x_image_id`)'))
  }

  if (await tableExists(db, '_eg_products_v')) {
    await addColumn(db, '_eg_products_v', 'version_created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_products_v', 'version_updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_products_v', 'version_schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_products_v_version_created_by_idx` ON `_eg_products_v` (`version_created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_products_v_version_updated_by_idx` ON `_eg_products_v` (`version_updated_by_id`)'))
    // Additional SEO/social fields to match pages/posts coverage
    await addColumn(db, '_eg_products_v', 'version_seo_canonical_url', 'text')
    await addColumn(db, '_eg_products_v', 'version_seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, '_eg_products_v', 'version_seo_social_title', 'text')
    await addColumn(db, '_eg_products_v', 'version_seo_social_description', 'text')
    await addColumn(db, '_eg_products_v', 'version_seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, '_eg_products_v', 'version_seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_products_v_version_seo_x_image_idx` ON `_eg_products_v` (`version_seo_x_image_id`)'))
  }

  // ---- Events: authorship and schema_type ----
  if (await tableExists(db, 'eg_events')) {
    await addColumn(db, 'eg_events', 'created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_events', 'updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_events', 'schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_events_created_by_idx` ON `eg_events` (`created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_events_updated_by_idx` ON `eg_events` (`updated_by_id`)'))
  }

  if (await tableExists(db, '_eg_events_v')) {
    await addColumn(db, '_eg_events_v', 'version_created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_events_v', 'version_updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_events_v', 'version_schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_events_v_version_created_by_idx` ON `_eg_events_v` (`version_created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_events_v_version_updated_by_idx` ON `_eg_events_v` (`version_updated_by_id`)'))
  }

  // ---- Courses: authorship and schema_type ----
  if (await tableExists(db, 'eg_courses')) {
    await addColumn(db, 'eg_courses', 'created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_courses', 'updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_courses', 'schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_courses_created_by_idx` ON `eg_courses` (`created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_courses_updated_by_idx` ON `eg_courses` (`updated_by_id`)'))
  }

  if (await tableExists(db, '_eg_courses_v')) {
    await addColumn(db, '_eg_courses_v', 'version_created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_courses_v', 'version_updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, '_eg_courses_v', 'version_schema_type', 'text')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_courses_v_version_created_by_idx` ON `_eg_courses_v` (`version_created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_courses_v_version_updated_by_idx` ON `_eg_courses_v` (`version_updated_by_id`)'))
  }

  engine.logger.info('[migrate] Authorship, schema_type, and product SEO columns added to pages, posts, products, events, and courses.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping these columns on a rollback
  // would delete important metadata that has been carefully configured, and that data
  // cannot be reconstructed afterwards.
  engine.logger.info('[migrate] Down is a no-op - authorship, schema_type, and product SEO columns are left in place.')
}
