// @vitest-environment node
// wrangler's getPlatformProxy() shells out to its bundled esbuild, which
// breaks under jsdom's separate vm realm (see tests/int/cms-db-faqs.int.spec.ts
// for the full explanation) - this suite is server-only and needs no DOM.
//
// THE FULL /api/internal-migrate ROUTE, PROVEN AGAINST A GENUINELY EMPTY D1.
//
// tests/int/localapi-migrate-fresh-install.int.spec.ts already proves the raw
// migration barrel (`src/migrations/index.ts`'s 18 files) works end to end
// against nothing. This suite proves something narrower but more load-bearing
// for the actual deploy-button acceptance requirement: the REAL sequence
// `/api/internal-migrate` runs in production - bootstrap, foundation
// migrations, additive schema sets, a second rename pass, then the
// hand-written feature migrations (see `@/migrations/runInternalMigrate`'s
// header comment for the full design and the gap this closes) - also produces
// a correct, fully `eg_`-prefixed database when run against a brand-new
// install, not just when it runs its old already-migrated-database no-op path.
//
// `getPlatformProxy({ persist: false })` gives a genuinely empty, in-memory
// local D1 with NO tables at all - not this dev's already-migrated one, and
// not even written to disk. Same mechanism the sibling suite already uses.
import { readFileSync } from 'fs'
import { join } from 'path'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

// `runInternalMigrate` (this route's own DB sequence) is only ONE step of the
// real, documented deploy pipeline (package.json's `deploy` script:
// `deploy:database && deploy:app && deploy:migrate && deploy:seed`).
// `deploy:database` runs FIRST, applying these 4 hand-built, `IF NOT EXISTS`
// SQL files via `wrangler d1 execute --remote` - a step that can only ever
// run from a CLI with wrangler credentials against the real D1, never from
// inside the deployed Worker (see the note on the D1 binding in
// wrangler.jsonc), which is exactly why it is a separate deploy step instead
// of something `/api/internal-migrate` could do itself. They create the
// `posts`/`products`/`blog_settings`/`faq_settings`/`shop_settings` block and
// `_rels` tables that migration
// `20260822_120859_fix_blocks_rels_tables` originally added non-idempotently
// - `runInternalMigrate`'s own `page-builder` schema set assumes these
// already exist (it only adds the newer `design` column and the
// loop/section/element block types on top), so a fair fresh-install proof
// has to run this step first too, exactly as a real `pnpm run deploy` would.
const FIX_BLOCKS_RELS_SQL = ['part1', 'part2', 'part3', 'part4'].map((part) =>
  readFileSync(join(process.cwd(), `src/migrations/sql/20260822_120859_fix_blocks_rels_tables_${part}.sql`), 'utf8'),
)

import { consoleLogger } from '@/localapi/logger'
import type { Drizzle } from '@/localapi/migrate'
import { EARLY_MIGRATIONS, LATE_MIGRATIONS, runInternalMigrate } from '@/migrations/runInternalMigrate'

describe('runInternalMigrate - fresh-install acceptance proof (genuinely empty D1, no persistence)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let rawDb: D1Database
  let db: Drizzle

  const listTables = async (): Promise<string[]> => {
    const result = await rawDb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
    return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
  }

  const tableExists = async (table: string): Promise<boolean> => (await listTables()).includes(table)

  const columnsOf = async (table: string): Promise<string[]> => {
    const result = await rawDb.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    rawDb = proxy.env.D1
    db = drizzle(rawDb) as unknown as Drizzle
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  it('confirms the database starts with no tables at all', async () => {
    expect(await listTables()).toEqual([])
  })

  it('the migration lists are the right shape: 5 foundation + 7 feature migrations, none overlapping', () => {
    expect(EARLY_MIGRATIONS).toHaveLength(5)
    expect(LATE_MIGRATIONS).toHaveLength(7)
    expect(EARLY_MIGRATIONS.map((m) => m.name)).toEqual([
      '20250929_111647',
      '20260819_043357_ecommerce_and_events',
      '20260819_070238_site_settings_pages_and_nav',
      '20260819_100000_event_registration_url',
      '20260822_055217_foundation_features',
    ])
    expect(LATE_MIGRATIONS.map((m) => m.name)).toEqual([
      '20260827_100000_security_audit_log',
      '20260828_110000_forms',
      '20260828_120000_multilingual',
      '20260828_130000_backups',
      '20260830_110000_members',
      '20260830_120000_courses',
      '20260830_130000_ab_testing',
    ])
  })

  it('applies deploy:database\'s raw SQL first, exactly as a real `pnpm run deploy` would', async () => {
    // Real order (package.json's `deploy` script): deploy:database, THEN
    // deploy:app, THEN deploy:migrate (`/api/internal-migrate`, i.e.
    // `runInternalMigrate` below). deploy:database only ever runs via
    // `wrangler d1 execute --remote` from a CLI with real Cloudflare
    // credentials - it cannot be exercised through `runInternalMigrate`
    // itself, so a fair fresh-install proof has to apply it here too.
    //
    // These 4 files' tables have FOREIGN KEY references to `posts`/`media`/
    // etc, which do not exist yet at this point (EARLY_MIGRATIONS hasn't run
    // yet either - this really does run first in the real pipeline). Confirmed
    // empirically against a real D1 proxy that SQLite/D1 does not validate a
    // FOREIGN KEY's target table at CREATE TABLE time, only at the later
    // point a row is actually inserted - so this succeeds in the same order
    // production really uses it.
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
  })

  it('runs the full route sequence against a fresh D1 with zero errors', async () => {
    const { errorCount, results } = await runInternalMigrate(rawDb, consoleLogger)
    expect(results).toBeTruthy()
    expect(errorCount).toBe(0)
  }, 60_000)

  it('records exactly the 12 migrations this route is responsible for, matching production', async () => {
    const rows = (await db.all(sql`SELECT name FROM eg_migrations ORDER BY id`)) as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual([...EARLY_MIGRATIONS, ...LATE_MIGRATIONS].map((m) => m.name))
  })

  it.each([
    // Engine bookkeeping (renamed from the foundation migration's frozen SQL).
    'eg_migrations',
    'eg_users',
    'eg_preferences',
    'eg_preferences_rels',
    'eg_locked_documents',
    'eg_locked_documents_rels',
    'eg_kv',
    // Foundation content/commerce tables, renamed from their pre-`eg_` names.
    'eg_media',
    'eg_pages',
    'eg_posts',
    'eg_events',
    'eg_products',
    'eg_carts',
    'eg_orders',
    'eg_transactions',
    'eg_addresses',
    'eg_navigation',
    'eg_integrations',
    'eg_site_settings',
    'eg_faqs',
    'eg_header',
    'eg_footer',
    'eg_page_templates',
    'eg_blog_settings',
    'eg_faq_settings',
    'eg_shop_settings',
    // The hand-written feature migrations' own tables.
    'eg_audit_log',
    'eg_forms',
    'eg_translations',
    'eg_backups',
    'eg_membership_tiers',
    'eg_courses',
    'eg_ab_tests',
  ])('creates the real, expected, correctly-`eg_`-prefixed table `%s`', async (table) => {
    expect(await tableExists(table)).toBe(true)
  })

  it.each(['users', 'pages', 'posts', 'media', 'products', 'orders', 'events', 'payload_migrations', 'payload_preferences', 'payload_locked_documents', 'payload_kv'])(
    'leaves no pre-rename leftover table `%s` behind',
    async (table) => {
      expect(await tableExists(table)).toBe(false)
    },
  )

  it('eg_locked_documents_rels has the 5 columns the "locked-documents-rels" schema set adds', async () => {
    const columns = await columnsOf('eg_locked_documents_rels')
    expect(columns).toContain('eg_audit_log_id')
    expect(columns).toContain('eg_backups_id')
    expect(columns).toContain('eg_translations_id')
    expect(columns).toContain('eg_membership_tiers_id')
    expect(columns).toContain('eg_memberships_id')
  })

  it('eg_users is genuinely writable - a real INSERT/SELECT round trip', async () => {
    await rawDb
      .prepare(
        `INSERT INTO eg_users (email, updated_at, created_at) VALUES (?, ?, ?)`,
      )
      .bind('fresh-install-smoke-test@example.com', new Date().toISOString(), new Date().toISOString())
      .run()
    const result = await rawDb.prepare(`SELECT email FROM eg_users WHERE email = ?`).bind('fresh-install-smoke-test@example.com').all()
    expect(result.results).toHaveLength(1)
  })

  it('running the whole sequence again is a fully idempotent no-op (safe on every future deploy)', async () => {
    const before = new Set(await listTables())
    const { errorCount, results } = await runInternalMigrate(rawDb, consoleLogger)
    expect(errorCount).toBe(0)
    expect(results['foundation-migrations']).toMatchObject({ applied: [], alreadyApplied: 5 })
    expect(results['feature-migrations']).toMatchObject({ applied: [], alreadyApplied: 7 })
    const after = new Set(await listTables())
    expect(after).toEqual(before)
  }, 60_000)
})
