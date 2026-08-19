import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`external_registration_url\` text;`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_external_registration_url\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`external_registration_url\`;`)
  await db.run(sql`ALTER TABLE \`_events_v\` DROP COLUMN \`version_external_registration_url\`;`)
}
