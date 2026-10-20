import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Build with AI v2: the per-provider model choice and monthly spend cap on the
 * Integrations global (`ai_claude_model`, `ai_openai_model`, `ai_monthly_cap_usd`),
 * and the `ai_builder_usage` table (counts only, never prompts or output).
 * Written and read with raw SQL (src/features/ai/builderUsage.ts), so the table is
 * not in the drizzle schema.
 *
 * Idempotent: columns are only added when missing, the table is CREATE IF NOT EXISTS.
 */

const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as { name: string }[]
  return rows.length > 0
}

const COLUMNS: Array<[column: string, type: string]> = [
  ['ai_claude_model', 'text'],
  ['ai_openai_model', 'text'],
  ['ai_monthly_cap_usd', 'numeric DEFAULT 0'],
]

const USAGE_TABLE =
  'CREATE TABLE IF NOT EXISTS `ai_builder_usage` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `created_at` text NOT NULL, `user_id` text, `provider` text NOT NULL, `model` text NOT NULL, `mode` text NOT NULL, `input_tokens` integer DEFAULT 0 NOT NULL, `output_tokens` integer DEFAULT 0 NOT NULL, `est_cost_micro` integer DEFAULT 0 NOT NULL, `ok` integer DEFAULT 1 NOT NULL)'

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  if (await tableExists(db, 'eg_integrations')) {
    for (const [column, type] of COLUMNS) await addColumn(db, 'eg_integrations', column, type)
  }
  await db.run(sql.raw(USAGE_TABLE))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `ai_builder_usage_created_at_idx` ON `ai_builder_usage` (`created_at`)'))
  engine.logger.info('[migrate] AI builder model, cap columns and ai_builder_usage table are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - AI builder usage table and columns are left in place.')
}
