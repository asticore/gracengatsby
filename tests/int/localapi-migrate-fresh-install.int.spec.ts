// @vitest-environment node
// wrangler's getPlatformProxy() shells out to its bundled esbuild, which
// breaks under jsdom's separate vm realm (see tests/int/cms-db-faqs.int.spec.ts
// for the full explanation) - this suite is server-only and needs no DOM.
//
// THE FRESH-INSTALL / DEPLOY-BUTTON ACCEPTANCE PROOF for src/localapi/migrate.ts
// (payload-removal-plan.md's "Fresh-install / deploy-button acceptance
// requirement" - a hard, user-flagged acceptance criterion for the whole
// removal project, not an optional nice-to-have).
//
// `getPlatformProxy({ persist: false })` gives a genuinely empty, in-memory
// local D1 database with NO tables at all - not this dev's already-migrated
// one, and not even written to disk (confirmed via wrangler's own
// `GetPlatformProxyOptions.persist` docs: "If `false` is specified no data is
// persisted on the filesystem"). This is the same mechanism
// `scripts/prepareEngineTables.mts` and every other D1-touching test in this
// project already use, just pointed at nothing instead of the persistent dev
// state directory - no new dependency needed.
//
// This test runs every one of this app's 18 real migrations (the same
// `src/migrations/index.ts` barrel `pnpm cms migrate` itself would have run)
// against that empty database via `runMigrations`, then proves the two things
// the acceptance requirement actually cares about: (a) `eg_migrations`
// bookkeeping ends up correct, and (b) a representative, unambiguous spread of
// tables from DIFFERENT migration files (chosen because they are created
// directly under their final `eg_`-prefixed name, not renamed later, so there
// is no rename-chain ambiguity about what to look for) actually exist AND are
// genuinely writable - not just present in sqlite_master.
//
// SCOPE NOTE, stated plainly rather than silently assumed: this does not
// assert full set-equality against the live dev database's entire table
// inventory (that database also carries tables from `applySchemaAdditions`
// and the still-open "5th SQL file" gap flagged in the plan doc, neither of
// which is part of `payload migrate`'s own job). What this test proves is the
// literal, narrower claim the acceptance requirement makes: the migration
// chain itself, run standalone against nothing, produces the tables it is
// supposed to produce, in the right bookkeeping order, and they work.
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runMigrations, type Drizzle, type MigrationEntry } from '@/localapi/migrate'
import { migrations } from '@/migrations'
import type { EngineDb } from '@/migrations/schema/engineBootstrap'

// The barrel's own migration entries are typed against real Payload's full
// MigrateUpArgs/MigrateDownArgs (payload: Payload, req: PayloadRequest) - our
// hand-rolled MigrationEntry narrows both to this app's real, confirmed usage
// (see src/localapi/migrate.ts's own header comment). Neither direction is
// structurally assignable to the other by design (ours is narrower), so this
// cast is the same "same real files, cast at the boundary" pattern already
// used by tests/int/localapi-config-parity.int.spec.ts.
const REAL_MIGRATIONS = migrations as unknown as MigrationEntry[]

describe('localapi/migrate - fresh-install acceptance proof (genuinely empty D1, no persistence)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: Drizzle
  let engineDb: EngineDb

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    const d1 = proxy.env.D1
    db = drizzle(d1) as unknown as Drizzle

    engineDb = {
      exists: async (table) => {
        const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).all()
        return (result.results?.length ?? 0) > 0
      },
      listTables: async () => {
        const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
        return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
      },
      columnsOf: async (table) => {
        const result = await d1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
        return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
      },
      run: (statement) => d1.prepare(statement).run(),
      countRows: async (table) => {
        const result = await d1.prepare(`SELECT COUNT(*) AS n FROM \`${table}\``).all()
        return (result.results?.[0] as { n: number } | undefined)?.n ?? 0
      },
    }
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  it('confirms the database starts with no tables at all', async () => {
    const tables = await engineDb.listTables()
    expect(tables).toEqual([])
  })

  it("runs every one of this app's 18 real migrations, in barrel order, against nothing", async () => {
    const result = await runMigrations({ db, engineDb, logger: consoleLogger, migrations: REAL_MIGRATIONS })

    expect(result.skipped).toEqual([])
    expect(result.batch).toBe(1)
    expect(result.ran).toEqual(migrations.map((m) => m.name))
    expect(result.ran).toHaveLength(18)
  }, 60_000)

  it('records one eg_migrations row per migration file, in the correct order and batch', async () => {
    const rows = (await db.all(sql`SELECT name, batch FROM eg_migrations ORDER BY id`)) as {
      name: string
      batch: number
    }[]
    expect(rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name))
    expect(rows.every((r) => r.batch === 1)).toBe(true)
  })

  it.each([
    'eg_migrations',
    'eg_audit_log',
    'eg_forms',
    'eg_forms_fields',
    'eg_translations',
    'eg_backups',
    'eg_membership_tiers',
    'eg_memberships',
    'eg_courses',
    'eg_lessons',
    'eg_enrolments',
    'eg_lesson_progress',
    'eg_ab_tests',
  ])('creates the real, expected table `%s`', async (table) => {
    expect(await engineDb.exists(table)).toBe(true)
  })

  it('eg_audit_log is not just present but genuinely writable - a real INSERT/SELECT round trip', async () => {
    await db.run(
      sql`INSERT INTO eg_audit_log (action, actor_email, updated_at, created_at) VALUES ('fresh-install-smoke-test', 'nobody@example.com', ${new Date().toISOString()}, ${new Date().toISOString()})`,
    )
    const rows = (await db.all(sql`SELECT action, actor_email FROM eg_audit_log WHERE action = 'fresh-install-smoke-test'`)) as {
      action: string
      actor_email: string
    }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.actor_email).toBe('nobody@example.com')
  })
})
