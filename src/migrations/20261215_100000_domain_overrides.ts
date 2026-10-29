import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Per-domain overrides on the domain registry rows (eg_domain_settings_domains, src/globals/DomainSettings.ts):
// site name, tagline, logo URL, contact email and phone, and four social links. Each is a text column that is NULL
// when the domain uses the site-wide value. Idempotent: a column is added only when PRAGMA table_info says it is
// missing. Registered last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const COLUMNS = ['site_name', 'tagline', 'logo_url', 'contact_email', 'contact_phone', 'instagram_url', 'facebook_url', 'linkedin_url', 'x_url']

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const existing = await columnsOf(db, 'eg_domain_settings_domains')
  if (existing.size > 0) {
    for (const column of COLUMNS) {
      if (!existing.has(column)) await db.run(sql.raw(`ALTER TABLE \`eg_domain_settings_domains\` ADD COLUMN \`${column}\` text`))
    }
  }
  engine.logger.info('[migrate] Per-domain override columns are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the per-domain override columns are left in place.')
}
