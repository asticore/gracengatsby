/**
 * The CMS's own data layer - the replacement in progress for src/engine/db.ts.
 *
 * STATUS: proof of concept, not wired in anywhere yet. src/engine/db.ts still
 * re-exports Payload's real @payloadcms/db-d1-sqlite adapter, and the live
 * site's reads/writes go through that adapter exclusively. This module talks
 * to the same D1 database and the same tables from the side, as a testbed -
 * see tests/int/cms-db-*.int.spec.ts, which prove a row written through this
 * code reads back correctly both here and through Payload's own engine.
 *
 * PROGRESS SO FAR
 *
 * Phase 1 hand-wrote a schema and CRUD ops for one collection (Faqs) to prove
 * the approach against a real table before generalising. Phase 2 did the
 * generalising: ./schema/generate.ts now derives a drizzle table straight
 * from a real Payload CollectionConfig's own field list (see its doc comment
 * for exactly which field types it covers), and ./generic.ts provides the
 * find/create/update/delete/count operations for any table it produces - a
 * collection's own file (./collections/*.ts) is now just that factory call
 * plus the types callers see, not hand-written SQL. Faqs was regenerated
 * through this path instead of kept as the original hand-written version,
 * and EventRSVPs was added alongside it to prove the generator on a second
 * collection - one that adds a single-target relationship field (`event` ->
 * an `event_id` FK column) on top of the scalar types Faqs covers. Payload
 * stores a non-hasMany, non-polymorphic relationship as a plain column on
 * the same table, not a child table, so this is still one row per document.
 *
 * WHAT IS STILL OUT OF SCOPE, AND WHY IT IS HARDER
 *
 * Payload's real adapter (@payloadcms/drizzle) is a generic engine: given any
 * collection config it derives a drizzle schema and full CRUD, versions,
 * drafts and joins for it. Running this app's actual config through
 * `payload generate:db-schema` produces over 10,000 lines of table
 * definitions alone - that is the real size of the surface a from-scratch
 * generic replacement has to cover. This app actively uses hasMany/
 * polymorphic relationships, arrays, blocks, versions, drafts and joins (see
 * src/collections/{Events,Pages,Posts}.ts and
 * src/features/courses/collections/Courses.ts) - each of those needs a child
 * table (`_rels`, per-array-item tables, `_v` version tables) and query-side
 * joins that the generator and generic ops here do not build yet. Next up,
 * in roughly this order: arrays/relationships-as-child-tables, versions and
 * drafts, then joins - each proven against a real collection with the same
 * write-both-ways parity test before moving to the next.
 *
 * See src/engine/index.ts for the seam this is meant to eventually replace
 * and the rules that govern it (only src/engine/ may import the vendor
 * package directly - this directory does not, and must not).
 */

export * from './collections/faqs'
export * from './collections/eventRSVPs'
