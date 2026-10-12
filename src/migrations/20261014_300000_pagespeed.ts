import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// PageSpeed Insights: the results table, the after-publish queue, the denormalised score columns on
// pages/posts/products/events (and their version tables), the API key column on Integrations and the
// two "Test after publish" settings on Speed. Idempotent: every statement can be replayed.

type Runner = MigrateUpArgs['db']

const TABLES = [
  `CREATE TABLE IF NOT EXISTS \`eg_pagespeed_results\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`collection\` text NOT NULL,
  \`doc_id\` integer NOT NULL,
  \`url\` text NOT NULL,
  \`strategy\` text NOT NULL,
  \`performance\` integer,
  \`accessibility\` integer,
  \`best_practices\` integer,
  \`seo\` integer,
  \`metrics\` text,
  \`field_data\` text,
  \`suggestions\` text,
  \`source\` text DEFAULT 'manual' NOT NULL,
  \`fetched_at\` text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_pagespeed_queue\` (
  \`collection\` text NOT NULL,
  \`doc_id\` integer NOT NULL,
  \`run_at\` text NOT NULL,
  \`attempts\` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (\`collection\`, \`doc_id\`)
)`,
]

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_pagespeed_results_doc_idx` ON `eg_pagespeed_results` (`collection`, `doc_id`, `strategy`, `fetched_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_pagespeed_results_fetched_idx` ON `eg_pagespeed_results` (`fetched_at`, `source`)',
  'CREATE INDEX IF NOT EXISTS `eg_pagespeed_queue_run_idx` ON `eg_pagespeed_queue` (`run_at`)',
]

const exists = async (db: Runner, table: string): Promise<boolean> =>
  ((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as unknown[]).length > 0

const addMissing = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  if (!(await exists(db, table))) return
  const cols = new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))
  if (!cols.has(column)) await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const statement of INDEXES) await db.run(sql.raw(statement))

  // Latest score per document, for the sortable "PageSpeed" list column.
  for (const live of ['eg_pages', 'eg_posts', 'eg_products', 'eg_events']) {
    await addMissing(db, live, 'pagespeed_score', 'numeric')
    await addMissing(db, live, 'pagespeed_at', 'text')
    await addMissing(db, `_${live}_v`, 'version_pagespeed_score', 'numeric')
    await addMissing(db, `_${live}_v`, 'version_pagespeed_at', 'text')
  }

  await addMissing(db, 'eg_integrations', 'google_page_speed_api_key', 'text')
  await addMissing(db, 'eg_speed_settings', 'pagespeed_test_after_publish', 'integer DEFAULT false')
  await addMissing(db, 'eg_speed_settings', 'pagespeed_daily_cap', 'numeric DEFAULT 20')
  engine.logger.info('[migrate] pagespeed tables and columns ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
