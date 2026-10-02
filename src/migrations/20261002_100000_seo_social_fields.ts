import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Adds SEO and social media columns to pages, posts, and courses tables.
//
// Written to be safe to replay, for the same reason the backups and forms
// migrations are: the CLI cannot reach production D1 from this CI environment
// (see the note on the D1 binding in wrangler.jsonc), so every statement has to
// survive running against a database that already has it. Tables and indexes
// use IF NOT EXISTS; SQLite has no `ADD COLUMN IF NOT EXISTS`, so the column
// adds swallow the duplicate-column error instead - see `addColumn`.
//
// The column names here follow the existing seo_ naming convention and the
// version tables mirror the base tables with version_ prefix.

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
  // ---- Pages: new SEO and social media fields ----
  if (await tableExists(db, 'eg_pages')) {
    await addColumn(db, 'eg_pages', 'seo_canonical_url', 'text')
    await addColumn(db, 'eg_pages', 'seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, 'eg_pages', 'seo_social_title', 'text')
    await addColumn(db, 'eg_pages', 'seo_social_description', 'text')
    await addColumn(db, 'eg_pages', 'seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, 'eg_pages', 'seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_pages_seo_x_image_idx` ON `eg_pages` (`seo_x_image_id`)'))
  }

  if (await tableExists(db, '_eg_pages_v')) {
    await addColumn(db, '_eg_pages_v', 'version_seo_canonical_url', 'text')
    await addColumn(db, '_eg_pages_v', 'version_seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, '_eg_pages_v', 'version_seo_social_title', 'text')
    await addColumn(db, '_eg_pages_v', 'version_seo_social_description', 'text')
    await addColumn(db, '_eg_pages_v', 'version_seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, '_eg_pages_v', 'version_seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_pages_v_version_seo_x_image_idx` ON `_eg_pages_v` (`version_seo_x_image_id`)'))
  }

  // ---- Posts: new SEO and social media fields ----
  if (await tableExists(db, 'eg_posts')) {
    await addColumn(db, 'eg_posts', 'seo_canonical_url', 'text')
    await addColumn(db, 'eg_posts', 'seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, 'eg_posts', 'seo_social_title', 'text')
    await addColumn(db, 'eg_posts', 'seo_social_description', 'text')
    await addColumn(db, 'eg_posts', 'seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, 'eg_posts', 'seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_posts_seo_x_image_idx` ON `eg_posts` (`seo_x_image_id`)'))
  }

  if (await tableExists(db, '_eg_posts_v')) {
    await addColumn(db, '_eg_posts_v', 'version_seo_canonical_url', 'text')
    await addColumn(db, '_eg_posts_v', 'version_seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, '_eg_posts_v', 'version_seo_social_title', 'text')
    await addColumn(db, '_eg_posts_v', 'version_seo_social_description', 'text')
    await addColumn(db, '_eg_posts_v', 'version_seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, '_eg_posts_v', 'version_seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_posts_v_version_seo_x_image_idx` ON `_eg_posts_v` (`version_seo_x_image_id`)'))
  }

  // ---- Courses: new SEO and social media fields (courses tables may not exist) ----
  if (await tableExists(db, 'eg_courses')) {
    await addColumn(db, 'eg_courses', 'seo_canonical_url', 'text')
    await addColumn(db, 'eg_courses', 'seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, 'eg_courses', 'seo_social_title', 'text')
    await addColumn(db, 'eg_courses', 'seo_social_description', 'text')
    await addColumn(db, 'eg_courses', 'seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, 'eg_courses', 'seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_courses_seo_x_image_idx` ON `eg_courses` (`seo_x_image_id`)'))
  }

  if (await tableExists(db, '_eg_courses_v')) {
    await addColumn(db, '_eg_courses_v', 'version_seo_canonical_url', 'text')
    await addColumn(db, '_eg_courses_v', 'version_seo_no_follow', 'integer DEFAULT false')
    await addColumn(db, '_eg_courses_v', 'version_seo_social_title', 'text')
    await addColumn(db, '_eg_courses_v', 'version_seo_social_description', 'text')
    await addColumn(db, '_eg_courses_v', 'version_seo_x_card', `text DEFAULT 'summary_large_image'`)
    await addColumn(db, '_eg_courses_v', 'version_seo_x_image_id', `integer REFERENCES \`eg_media\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_courses_v_version_seo_x_image_idx` ON `_eg_courses_v` (`version_seo_x_image_id`)'))
  }

  engine.logger.info('[migrate] SEO and social media columns added to pages, posts, and courses.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping these columns on a
  // rollback would delete SEO metadata that has been carefully configured, and
  // that data cannot be reconstructed afterwards.
  engine.logger.info('[migrate] Down is a no-op - the SEO and social media columns are left in place.')
}
