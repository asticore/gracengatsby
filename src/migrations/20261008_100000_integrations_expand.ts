import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Expands the integrations global with new groups: Google, reCAPTCHA, Clarity, Meta Pixel,
// Cloudflare, and Custom Keys. Migrates existing values from seo-settings where applicable.

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

/**
 * Check if a column exists in a table.
 */
const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  // ---- Integrations table: new columns for expanded groups ----
  if (await tableExists(db, 'eg_integrations')) {
    // Google group
    await addColumn(db, 'eg_integrations', 'google_ga4_measurement_id', 'text')
    await addColumn(db, 'eg_integrations', 'google_gtm_container_id', 'text')
    await addColumn(db, 'eg_integrations', 'google_search_console_verification', 'text')
    await addColumn(db, 'eg_integrations', 'google_maps_api_key', 'text')

    // reCAPTCHA group
    await addColumn(db, 'eg_integrations', 'recaptcha_version', `text DEFAULT 'v3'`)
    await addColumn(db, 'eg_integrations', 'recaptcha_site_key', 'text')
    await addColumn(db, 'eg_integrations', 'recaptcha_secret_key', 'text')

    // Clarity group
    await addColumn(db, 'eg_integrations', 'clarity_project_id', 'text')

    // Meta Pixel group
    await addColumn(db, 'eg_integrations', 'meta_pixel_pixel_id', 'text')

    // Cloudflare group
    await addColumn(db, 'eg_integrations', 'cloudflare_zone_id', 'text')
    await addColumn(db, 'eg_integrations', 'cloudflare_api_token', 'text')
    await addColumn(db, 'eg_integrations', 'cloudflare_purge_on_publish', `integer DEFAULT 1`)

    // AI keys sit at the top level, beside the original claude_api_key column
    await addColumn(db, 'eg_integrations', 'openai_api_key', 'text')

    // Custom keys child table
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`eg_integrations_custom_keys\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`name\` text,
      \`value\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_integrations\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`))
    await db.run(
      sql.raw('CREATE INDEX IF NOT EXISTS `eg_integrations_custom_keys_order_idx` ON `eg_integrations_custom_keys` (`_order`)'),
    )
    await db.run(
      sql.raw(
        'CREATE INDEX IF NOT EXISTS `eg_integrations_custom_keys_parent_id_idx` ON `eg_integrations_custom_keys` (`_parent_id`)',
      ),
    )
  }

  // ---- Migrate existing values from seo-settings ----
  const integrationsTableExists = await tableExists(db, 'eg_integrations')
  const seoTableExists = await tableExists(db, 'eg_seo_settings')

  if (integrationsTableExists && seoTableExists) {
    // Check if integrations row exists
    const integrationsRows = (await db.all(sql`SELECT id FROM eg_integrations`)) as { id: number }[]

    if (integrationsRows.length === 0) {
      // Create integrations row if it doesn't exist
      await db.run(sql`INSERT INTO eg_integrations (created_at, updated_at) VALUES (datetime('now'), datetime('now'))`)
    }

    // Now migrate values from seo-settings where integrations values are NULL
    const hasGa4Col = await columnExists(db, 'eg_seo_settings', 'analytics_ga4_measurement_id')
    const hasGtmCol = await columnExists(db, 'eg_seo_settings', 'analytics_gtm_container_id')
    const hasPixelCol = await columnExists(db, 'eg_seo_settings', 'analytics_meta_pixel_id')
    const hasVerifyCol = await columnExists(db, 'eg_seo_settings', 'verification_google')

    if (hasGa4Col && (await columnExists(db, 'eg_integrations', 'google_ga4_measurement_id'))) {
      await db.run(sql.raw(`
        UPDATE eg_integrations
        SET google_ga4_measurement_id = (SELECT analytics_ga4_measurement_id FROM eg_seo_settings LIMIT 1)
        WHERE google_ga4_measurement_id IS NULL
          AND (SELECT analytics_ga4_measurement_id FROM eg_seo_settings LIMIT 1) IS NOT NULL
      `))
    }

    if (hasGtmCol && (await columnExists(db, 'eg_integrations', 'google_gtm_container_id'))) {
      await db.run(sql.raw(`
        UPDATE eg_integrations
        SET google_gtm_container_id = (SELECT analytics_gtm_container_id FROM eg_seo_settings LIMIT 1)
        WHERE google_gtm_container_id IS NULL
          AND (SELECT analytics_gtm_container_id FROM eg_seo_settings LIMIT 1) IS NOT NULL
      `))
    }

    if (hasPixelCol && (await columnExists(db, 'eg_integrations', 'meta_pixel_pixel_id'))) {
      await db.run(sql.raw(`
        UPDATE eg_integrations
        SET meta_pixel_pixel_id = (SELECT analytics_meta_pixel_id FROM eg_seo_settings LIMIT 1)
        WHERE meta_pixel_pixel_id IS NULL
          AND (SELECT analytics_meta_pixel_id FROM eg_seo_settings LIMIT 1) IS NOT NULL
      `))
    }

    if (hasVerifyCol && (await columnExists(db, 'eg_integrations', 'google_search_console_verification'))) {
      await db.run(sql.raw(`
        UPDATE eg_integrations
        SET google_search_console_verification = (SELECT verification_google FROM eg_seo_settings LIMIT 1)
        WHERE google_search_console_verification IS NULL
          AND (SELECT verification_google FROM eg_seo_settings LIMIT 1) IS NOT NULL
      `))
    }
  }

  engine.logger.info('[migrate] Integrations expanded with new groups and custom keys.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping these columns on a rollback
  // would delete important configuration that has been carefully set up, and that data
  // cannot be reconstructed afterwards.
  engine.logger.info('[migrate] Down is a no-op - integration columns and keys table are left in place.')
}
