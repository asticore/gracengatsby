import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Email design storage: a designed layout per automatic email (a JSON list of blocks, one column per template on
// eg_email_templates) and the brand every designed email is wrapped in (table eg_email_brand, global `email-brand`).
// Idempotent: the table is CREATE TABLE IF NOT EXISTS, and each design column is only added when PRAGMA table_info
// says it is missing. Column names mirror src/cms/db/schema/generate.ts for src/globals/EmailTemplates.ts (the
// <key>Design fields) and src/globals/EmailBrand.ts.

type Runner = MigrateUpArgs['db']

const DESIGN_COLUMNS = [
  'account_reset_design',
  'account_already_registered_design',
  'account_welcome_design',
  'membership_renewal_design',
  'approval_submitted_design',
  'approval_decision_design',
  'rsvp_confirmation_design',
  'event_reminder_design',
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

const addColumnIfMissing = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  const existing = await columnsOf(db, table)
  if (existing.size === 0 || existing.has(column)) return
  await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      'CREATE TABLE IF NOT EXISTS `eg_email_brand` ( `id` integer PRIMARY KEY NOT NULL, `enabled` integer, `logo_id` integer, `logo_width` numeric, `accent` text, `text_color` text, `background` text, `content_background` text, `font_stack` text, `button_radius` numeric, `footer_text` text, `address` text, `updated_at` text, `created_at` text )',
    ),
  )

  // A partial install may not have the templates table yet; its design columns arrive with the table.
  for (const column of DESIGN_COLUMNS) await addColumnIfMissing(db, 'eg_email_templates', column, 'text')

  engine.logger.info('[migrate] Email design and brand ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the email design columns and brand table are left in place.')
}
