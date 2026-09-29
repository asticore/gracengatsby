/**
 * Engine seam: migration primitives.
 *
 * Every migration file in src/migrations/ imports `sql` and its argument
 * types from here. `sql` is drizzle-orm's own tagged template (what the
 * old vendor adapter re-exported); `MigrateUpArgs`/`MigrateDownArgs` are this
 * app's own hand-rolled shapes (`@/localapi/migrate`), narrowed to what the
 * migrations actually use (`db`, `payload.logger`).
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */

export { sql } from 'drizzle-orm'

export type { MigrateDownArgs, MigrateUpArgs } from '@/localapi/migrate'
