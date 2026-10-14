import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Editable email wording (table eg_email_templates, global `email-templates`).
// Idempotent: CREATE TABLE IF NOT EXISTS. Column names mirror src/cms/db/schema/generate.ts for
// src/globals/EmailTemplates.ts: each group's fields become <group>_<field> in snake case.

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      'CREATE TABLE IF NOT EXISTS `eg_email_templates` ( `id` integer PRIMARY KEY NOT NULL, `account_reset_subject` text, `account_reset_body` text, `account_already_registered_subject` text, `account_already_registered_body` text, `account_welcome_subject` text, `account_welcome_body` text, `membership_renewal_subject` text, `membership_renewal_body` text, `approval_submitted_subject` text, `approval_submitted_body` text, `approval_decision_subject` text, `approval_decision_body` text, `rsvp_confirmation_subject` text, `rsvp_confirmation_body` text, `updated_at` text, `created_at` text )',
    ),
  )
  engine.logger.info('[migrate] Email templates ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the email templates table is left in place.')
}
