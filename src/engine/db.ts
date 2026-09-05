/**
 * Engine seam: the database adapter and migration primitives.
 *
 * This is the first subsystem slated for replacement (see the roadmap), and
 * the smallest vendor surface in the whole seam - four symbols. Every
 * migration file in src/migrations/ imports its argument types from here, so
 * when our own D1 layer lands it only has to satisfy this contract.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */

export { sqliteD1Adapter, sql } from '@payloadcms/db-d1-sqlite'

export type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-d1-sqlite'
