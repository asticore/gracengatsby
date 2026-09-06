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
 * Phase 5 added `group` fields (flattened onto the table with the group's
 * name prefixed onto each column, e.g. `location_venue_name` - confirmed
 * against eg_events/eg_pages - but reconstructed as a nested object,
 * `doc.location = {venueName, ...}`, in the document shape, unlike
 * row/collapsible which stay flat there too) and `versions: { drafts: true }`
 * (the parallel `_<table>_v` table - one row per saved version, not per
 * document; see ./schema/generate.ts's generateVersionsTable doc comment for
 * the real shape). It also taught the generator that `join` fields carry no
 * column at all (confirmed against eg_events - no `rsvps` column exists) and
 * that a collection with drafts enabled never gets a SQL NOT NULL from a
 * field's `required: true`, live table or version table alike (confirmed:
 * eg_faqs.question - required, no drafts - is NOT NULL; eg_events.title and
 * eg_pages.title - both required, both have drafts - are not). Proven
 * against Events, chosen over Pages/Posts/Courses (this app's other
 * versioned collections) specifically because it needs group+versions
 * without ALSO needing blocks/array-in-versions (not built yet - see below)
 * or a working join to be usable at all.
 *
 * WHAT IS STILL OUT OF SCOPE, AND WHY IT IS HARDER
 *
 * Payload's real adapter (@payloadcms/drizzle) is a generic engine: given any
 * collection config it derives a drizzle schema and full CRUD, versions,
 * drafts and joins for it. Running this app's actual config through
 * `payload generate:db-schema` produces over 10,000 lines of table
 * definitions alone - that is the real size of the surface a from-scratch
 * generic replacement has to cover. Three things remain:
 *
 *  - Versioned blocks/array child tables (e.g. `_eg_pages_v_blocks_hero`) -
 *    confirmed to have a different id scheme than their live counterparts
 *    (an integer `id` plus an extra `_uuid` column, instead of the live
 *    table's string `id`), needed before Pages/Posts (both use `blocks`) can
 *    get versions support.
 *  - `join` fields resolved for real (right now they are simply absent from
 *    the document) - query-time assembly against the related collection's
 *    own relationship/hasMany field, e.g. Events' `rsvps` against
 *    EventRSVPs' `event`.
 *  - Draft/publish application-level semantics: whether every live write
 *    should also create a version row, and how `_status`/`latest` should
 *    govern reads, is a Payload-level policy question this data layer's
 *    createVersionsOps deliberately leaves open rather than guessing (see
 *    ./generic.ts's doc comment on it) - something will need to decide this
 *    before create/updateByID can be trusted on a drafts-enabled collection.
 *
 * Next up: versioned blocks/arrays (proven against Pages), then joins - each
 * proven against a real collection with the same write-both-ways parity test
 * before moving on.
 *
 * See src/engine/index.ts for the seam this is meant to eventually replace
 * and the rules that govern it (only src/engine/ may import the vendor
 * package directly - this directory does not, and must not).
 */

export * from './collections/faqs'
export * from './collections/eventRSVPs'
export * from './collections/membershipTiers'
export * from './collections/pageTemplates'
export * from './collections/events'
