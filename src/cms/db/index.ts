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
 * the approach against a real table before generalising. Phase 2 generalised
 * it: ./schema/generate.ts derives a drizzle table straight from a real
 * Payload CollectionConfig's own field list, and ./generic.ts provides
 * find/create/update/delete/count for any table it produces - a collection's
 * own file (./collections/*.ts) is now just that factory call plus the types
 * callers see. EventRSVPs proved a single-target relationship field (`event`
 * -> an `event_id` FK column, still one row per document - Payload only
 * needs a child table for hasMany/polymorphic relationships).
 *
 * Phase 3 added row/collapsible flattening (their fields land on the parent
 * table, same as Payload's own schema - confirmed against
 * eg_membership_tiers) and array fields as child tables: MembershipTiers'
 * `benefits` array generates eg_membership_tiers_benefits (`_order`,
 * `_parent_id` cascading on delete, a string `id` per row, then the array's
 * own subfields), and ./generic.ts assembles/replaces those child rows as
 * part of the parent document's find/create/update, matching Payload's
 * document shape.
 *
 * Phase 4 added `blocks` fields and hasMany/polymorphic relationship/upload
 * fields together, because in this app's real config the second only ever
 * shows up inside the first (see src/blocks/Faq.ts's `faqs` and
 * src/blocks/Gallery.ts's `images` - nothing here has a plain top-level
 * hasMany field). Proven against PageTemplates, whose `blocks` field uses the
 * full page-builder block library: one child table per block type (e.g.
 * eg_page_templates_blocks_hero, eg_page_templates_blocks_faq - not one
 * shared table for every block type), with `_order` sequential across every
 * block type sharing the field, and hasMany/polymorphic subfields writing
 * into the collection's single shared `_rels` table
 * (eg_page_templates_rels) rather than a table of their own - confirmed by
 * creating a real document through Payload's own engine.create() and
 * inspecting the D1 tables it produced, not guessed. See
 * ./schema/generate.ts's generateBlockTables/generateRelsTable doc comments
 * for the full shape.
 *
 * WHAT IS STILL OUT OF SCOPE, AND WHY IT IS HARDER
 *
 * Payload's real adapter (@payloadcms/drizzle) is a generic engine: given any
 * collection config it derives a drizzle schema and full CRUD, versions,
 * drafts and joins for it. Running this app's actual config through
 * `payload generate:db-schema` produces over 10,000 lines of table
 * definitions alone - that is the real size of the surface a from-scratch
 * generic replacement has to cover. This app actively uses versions, drafts
 * and joins (see src/collections/{Events,Pages,Posts}.ts and
 * src/features/courses/collections/Courses.ts) - versions need a parallel
 * `_<table>_v` table set (with its own id quirks - a versioned array/block
 * child table uses an integer `id` plus an extra `_uuid` column, unlike the
 * live table's string `id`) and joins need query-side assembly that the
 * generator and generic ops here do not build yet. Next up: versions/drafts,
 * then joins - each proven against a real collection with the same
 * write-both-ways parity test before moving on.
 *
 * See src/engine/index.ts for the seam this is meant to eventually replace
 * and the rules that govern it (only src/engine/ may import the vendor
 * package directly - this directory does not, and must not).
 */

export * from './collections/faqs'
export * from './collections/eventRSVPs'
export * from './collections/membershipTiers'
export * from './collections/pageTemplates'
