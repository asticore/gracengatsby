/**
 * Shared setup for every test that needs a genuinely fresh, fully-migrated
 * D1 to work against - the same two steps a real `pnpm run deploy` runs
 * before the app is usable (`deploy:database`, then `deploy:migrate` /
 * `/api/internal-migrate`; `deploy:app`/`deploy:seed` are not relevant to
 * schema setup). See `@/migrations/runInternalMigrate`'s header comment for
 * why `deploy:database`'s raw SQL has to run first.
 *
 * Pair with `getPlatformProxy({ persist: false })` (wrangler) for the D1
 * itself - a genuinely empty, in-memory, non-persisted local D1, not this
 * dev's already-migrated one.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

const FIX_BLOCKS_RELS_SQL = ['part1', 'part2', 'part3', 'part4'].map((part) =>
  readFileSync(join(process.cwd(), `src/migrations/sql/20260822_120859_fix_blocks_rels_tables_${part}.sql`), 'utf8'),
)

/**
 * Applies `deploy:database`'s raw SQL step (see that script in package.json)
 * against `rawDb`. Real order: this runs via `wrangler d1 execute --remote`
 * from a CLI with real Cloudflare credentials, BEFORE `deploy:app`/
 * `deploy:migrate` - it can only ever be exercised here as a literal SQL
 * replay, never through `runInternalMigrate` itself (that runs from inside
 * the deployed Worker, which cannot invoke `wrangler` against itself).
 */
export async function applyDeployDatabaseSql(rawDb: D1Database): Promise<void> {
  for (const fileContent of FIX_BLOCKS_RELS_SQL) {
    const statements = fileContent
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)

    for (const statement of statements) {
      await rawDb.prepare(statement).run()
    }
  }
}

/**
 * Full fresh-install setup: `deploy:database`'s raw SQL, then
 * `runInternalMigrate` (`/api/internal-migrate`'s own sequence). Returns
 * `runInternalMigrate`'s own result so a caller can assert on it directly
 * (see `tests/int/internal-migrate-fresh-install.int.spec.ts`).
 */
export async function setupFreshInstall(rawDb: D1Database): Promise<InternalMigrateResult> {
  await applyDeployDatabaseSql(rawDb)
  return runInternalMigrate(rawDb, consoleLogger)
}
