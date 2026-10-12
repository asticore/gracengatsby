import { MigrateDownArgs, MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

/**
 * Visual form builder: columns added to the forms, their entries and the Forms
 * settings. Names match what the schema generator derives from the field names
 * in Forms.ts, FormSubmissions.ts and FormSettings.ts.
 *
 * `form_status` is left null on existing forms on purpose: a form made before
 * the builder counts as published (see features/forms/layout.ts), so nothing
 * disappears from a live site. Idempotent: each column and index is checked
 * first, and the key backfill only touches rows that have none.
 */
const COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ['eg_forms', 'form_status', 'text'],
  ['eg_forms', 'embed_key', 'text'],
  ['eg_forms', 'layout', 'text'],
  ['eg_forms', 'published_layout', 'text'],
  ['eg_forms', 'form_config', 'text'],
  ['eg_form_submissions', 'status', "text DEFAULT 'new'"],
  ['eg_form_submissions', 'assignee_id', 'integer REFERENCES `eg_users`(`id`)'],
  ['eg_form_submissions', 'notes', 'text'],
  ['eg_form_submissions', 'source_url', 'text'],
  ['eg_form_submissions', 'consent', 'text'],
  ['eg_form_submissions', 'webhook_deliveries', 'text'],
  ['eg_form_submissions', 'webhook_state', 'text'],
  ['eg_form_submissions', 'webhook_retry_at', 'text'],
  ['eg_form_settings', 'spam_captcha_provider', "text DEFAULT 'turnstile'"],
  ['eg_form_settings', 'spam_recaptcha_site_key', 'text'],
  ['eg_form_settings', 'spam_recaptcha_secret_key', 'text'],
  ['eg_form_settings', 'spam_recaptcha_min_score', 'numeric DEFAULT 0.5'],
]

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `forms_form_status_idx` ON `eg_forms` (`form_status`)',
  'CREATE INDEX IF NOT EXISTS `forms_embed_key_idx` ON `eg_forms` (`embed_key`)',
  'CREATE INDEX IF NOT EXISTS `form_submissions_status_idx` ON `eg_form_submissions` (`status`)',
  'CREATE INDEX IF NOT EXISTS `form_submissions_assignee_idx` ON `eg_form_submissions` (`assignee_id`)',
  'CREATE INDEX IF NOT EXISTS `form_submissions_webhook_state_idx` ON `eg_form_submissions` (`webhook_state`)',
]

const newKey = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [table, column, definition] of COLUMNS) {
    if (!(await columnExists(db, table, column))) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`))
    }
  }
  for (const statement of INDEXES) await db.run(sql.raw(statement))

  const missing = (await db.all(sql.raw('SELECT `id` FROM `eg_forms` WHERE `embed_key` IS NULL OR `embed_key` = \'\''))) as { id: number }[]
  for (const row of missing) {
    await db.run(sql.raw(`UPDATE \`eg_forms\` SET \`embed_key\` = 'f${newKey()}' WHERE \`id\` = ${Number(row.id)}`))
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns without rebuilding the table, so this is a no-op.
}
