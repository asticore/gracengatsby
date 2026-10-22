import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

const tableExists = async (db: Runner, table: string): Promise<boolean> =>
  ((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as unknown[]).length > 0

/**
 * Blog tags (array `tags` on Posts, mirroring `categories`) and public author fields on Users
 * (`display_name`, unique `slug`). Idempotent.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (await tableExists(db, 'eg_posts')) {
    await db.run(
      sql.raw(`CREATE TABLE IF NOT EXISTS \`eg_posts_tags\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`),
    )
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_posts_tags_order_idx` ON `eg_posts_tags` (`_order`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_posts_tags_parent_id_idx` ON `eg_posts_tags` (`_parent_id`)'))
  }
  if (await tableExists(db, '_eg_posts_v')) {
    await db.run(
      sql.raw(`CREATE TABLE IF NOT EXISTS \`_eg_posts_v_version_tags\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text,
  \`_uuid\` text,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`_eg_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`),
    )
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_posts_v_version_tags_order_idx` ON `_eg_posts_v_version_tags` (`_order`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_posts_v_version_tags_parent_id_idx` ON `_eg_posts_v_version_tags` (`_parent_id`)'))
  }
  if (await tableExists(db, 'eg_users')) {
    for (const [column, type] of [
      ['display_name', 'text'],
      ['slug', 'text'],
    ] as const) {
      if (!(await columnExists(db, 'eg_users', column))) {
        await db.run(sql.raw(`ALTER TABLE \`eg_users\` ADD COLUMN \`${column}\` ${type}`))
      }
    }
    await db.run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS `eg_users_slug_idx` ON `eg_users` (`slug`)'))
  }
}

export async function down(): Promise<void> {
  // SQLite cannot drop columns cheaply; left in place.
}
