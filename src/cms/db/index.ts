/**
 * The CMS's own data layer - the replacement in progress for src/engine/db.ts.
 *
 * STATUS: proof of concept, not wired in anywhere yet. src/engine/db.ts still
 * re-exports Payload's real @payloadcms/db-d1-sqlite adapter, and the live
 * site's reads/writes go through that adapter exclusively. This module talks
 * to the same D1 database and the same tables from the side, as a testbed -
 * see tests/int/cms-db-faqs.int.spec.ts, which proves a row written through
 * this code reads back correctly both here and through Payload's own engine.
 *
 * WHY ONE HAND-WRITTEN COLLECTION FIRST, NOT A GENERIC ADAPTER
 *
 * Payload's real adapter (@payloadcms/drizzle) is a generic engine: given any
 * collection config it derives a drizzle schema and full CRUD, versions,
 * drafts and joins for it. Running this app's actual config through
 * `payload generate:db-schema` produces over 10,000 lines of table
 * definitions alone - that is the real size of the surface a from-scratch
 * generic replacement has to cover, before even counting query translation,
 * versions, drafts, joins and blocks-as-child-tables (this app uses all four
 * - see src/collections/{Events,Pages,Posts}.ts and
 * src/features/courses/collections/Courses.ts).
 *
 * Building that generic engine first, with nothing real to test it against,
 * risks weeks of infrastructure work with no working slice along the way. So
 * this starts the other way around: hand-write the schema and operations for
 * one real, currently-live collection - Faqs, chosen because it has no
 * relationships, arrays, blocks, versions or joins, so it is one row per
 * document with no child tables - verify it against the actual local D1
 * database, then generalise into a schema generator that derives this
 * automatically from any collection's field config. That generator, plus
 * versions/drafts/joins/blocks support, is the next phase.
 *
 * See src/engine/index.ts for the seam this is meant to eventually replace
 * and the rules that govern it (only src/engine/ may import the vendor
 * package directly - this directory does not, and must not).
 */

export * from './collections/faqs'
