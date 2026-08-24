import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-d1-sqlite'

import { seedHomeAndTemplates } from '@/seed/seedHomeAndTemplates'

// Seeds a real, published Home page (isHomepage: true) and a handful of
// starter Page Templates. Kept for local/dev use (the CLI's `migrate` against
// a local emulated D1). On real production this same logic is also exposed
// over real HTTP via /api/internal-seed (see src/app/(engage)/api/internal-seed/route.ts)
// and wired into `pnpm run deploy`, because the CLI's `migrate` in this CI
// environment can only ever reach a local emulated database, never real D1
// (see the note on the D1 binding in wrangler.jsonc). Fully idempotent -
// safe to run against a database that already has a homepage and/or
// templates (it just skips).

export async function up({ payload: engine }: MigrateUpArgs): Promise<void> {
  // Deliberately non-fatal.
  //
  // This step seeds through the CMS engine's local API, and the local API always
  // queries using the CURRENT config's schema - it selects every column the
  // collections define today, including ones added by migrations that come
  // AFTER this one (e.g. `custom_fields`). Replaying the migration chain from
  // scratch therefore reaches this point with a database that does not yet
  // have those columns, and the seed query fails with "no such column",
  // taking the whole deploy down with it.
  //
  // Seeding is convenience content, not schema, and production is seeded
  // through /api/internal-seed once the app is deployed and the schema is
  // current. So a failure here is logged and stepped over rather than allowed
  // to break the chain that later migrations depend on.
  try {
    await seedHomeAndTemplates(engine)
  } catch (error) {
    engine.logger.warn(
      `[seed] Skipped seeding during migration (${String(
        (error as Error)?.message || error,
      )}). This is expected when replaying migrations against an older schema - /api/internal-seed handles production.`,
    )
  }
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // Intentionally a no-op: this migration only seeds convenience starter
  // content. Rolling it back would delete a real, possibly-edited Home page
  // and templates, which is far more destructive than leaving them in place.
  engine.logger.info('[seed] Down migration is a no-op - seeded Home page/templates are left in place.')
}
