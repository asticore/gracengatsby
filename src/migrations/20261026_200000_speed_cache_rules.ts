import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Edge page cache (wave 17): the cache version number the Worker keys its copies on, and the
// never-cache rules and mobile switch in the Speed caching group. Idempotent: every column is
// added only when it is missing, so the migration can be replayed on any install.

type Runner = MigrateUpArgs['db']

const addMissing = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  const cols = new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))
  if (cols.size === 0) return
  if (!cols.has(column)) await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addMissing(db, 'eg_speed_settings', 'cache_epoch', 'numeric DEFAULT 1')
  await addMissing(db, 'eg_speed_settings', 'caching_never_cache_paths', 'text')
  await addMissing(db, 'eg_speed_settings', 'caching_never_cache_cookies', 'text')
  await addMissing(db, 'eg_speed_settings', 'caching_never_cache_query_strings', 'text')
  await addMissing(db, 'eg_speed_settings', 'caching_cache_mobile_separately', 'integer DEFAULT false')
  engine.logger.info('[migrate] edge cache rule columns ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {}