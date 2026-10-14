import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// When emails are sent (table eg_email_schedule, global `email-schedule`), the event reminder's sent marker on
// eg_event_rsvps, and the event reminder wording on eg_email_templates. Idempotent: the table is CREATE TABLE IF NOT
// EXISTS, and each column is only added when PRAGMA table_info says it is missing and the table is there.
// Column names mirror src/cms/db/schema/generate.ts for src/globals/EmailSchedule.ts, the eventReminder group in
// src/globals/EmailTemplates.ts, and the reminderSentAt field in src/collections/EventRSVPs.ts.

type Runner = MigrateUpArgs['db']

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
      'CREATE TABLE IF NOT EXISTS `eg_email_schedule` ( `id` integer PRIMARY KEY NOT NULL, `account_welcome_enabled` integer, `account_reset_enabled` integer, `account_already_registered_enabled` integer, `membership_renewal_enabled` integer, `membership_renewal_days_before` numeric, `rsvp_confirmation_enabled` integer, `event_reminder_enabled` integer, `event_reminder_hours_before` numeric, `approval_submitted_enabled` integer, `approval_decision_enabled` integer, `back_in_stock_enabled` integer, `low_stock_alert_enabled` integer, `quiet_hours_enabled` integer, `quiet_hours_start` text, `quiet_hours_end` text, `updated_at` text, `created_at` text )',
    ),
  )

  // A partial install may not have the RSVP or template tables yet; their columns arrive with the table.
  await addColumnIfMissing(db, 'eg_event_rsvps', 'reminder_sent_at', 'text')
  await addColumnIfMissing(db, 'eg_email_templates', 'event_reminder_subject', 'text')
  await addColumnIfMissing(db, 'eg_email_templates', 'event_reminder_body', 'text')

  engine.logger.info('[migrate] When emails are sent and event reminders ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the email schedule table and event reminder columns are left in place.')
}
