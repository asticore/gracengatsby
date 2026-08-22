import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-d1-sqlite'

import { seedHomeAndTemplates } from '@/seed/seedHomeAndTemplates'

// Seeds a real, published Home page (isHomepage: true) and a handful of
// starter Page Templates. Kept for local/dev use (`payload migrate` against
// a local emulated D1). On real production this same logic is also exposed
// over real HTTP via /api/internal-seed (see src/app/(payload)/api/internal-seed/route.ts)
// and wired into `pnpm run deploy`, because `payload migrate` in this CI
// environment can only ever reach a local emulated database, never real D1
// (see the note on the D1 binding in wrangler.jsonc). Fully idempotent -
// safe to run against a database that already has a homepage and/or
// templates (it just skips).

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  await seedHomeAndTemplates(payload)
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Intentionally a no-op: this migration only seeds convenience starter
  // content. Rolling it back would delete a real, possibly-edited Home page
  // and templates, which is far more destructive than leaving them in place.
  payload.logger.info('[seed] Down migration is a no-op - seeded Home page/templates are left in place.')
}
