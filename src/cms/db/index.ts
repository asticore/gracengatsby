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
 * without ALSO needing blocks/array-in-versions (not built yet at the time)
 * or a working join to be usable at all.
 *
 * Phase 6 closed that gap: versioned `blocks` fields and their nested
 * hasMany/polymorphic subfields. Proven against Pages (its `blocks` field
 * uses the same page-builder library already proven live, not versioned,
 * against PageTemplates in Phase 4). Confirmed by creating real documents
 * through Payload's own engine.create() and inspecting the resulting D1
 * tables directly:
 *
 *  - A versioned block table (e.g. `_eg_pages_v_blocks_hero`) has an integer
 *    autoincrement `id` plus an extra `_uuid` text column, instead of the
 *    live table's string `id` - see ./schema/generate.ts's generateBlockTables
 *    `versioned` param doc comment.
 *  - Both a versioned block row's own `_path` column and a nested hasMany
 *    subfield's `path` in the versioned `_rels` table get a "version."
 *    (dot) prefix the live table's equivalents never get (`_path` = "blocks"
 *    live, "version.blocks" versioned; `path` = "blocks.0.faqs" live,
 *    "version.blocks.0.faqs" versioned) - a different prefix scheme than the
 *    "version_" (underscore) prefix on the versions table's own COLUMN
 *    names. See ./generic.ts's createBlocksRelsOps `pathPrefix` doc comment.
 *  - A versioned block/rels row's `_parent_id`/`parent_id` FK points at the
 *    VERSION ROW's own id, not the live document's id - confirmed via the
 *    real FOREIGN KEY clause in each table's CREATE TABLE statement, not
 *    assumed from the live-table pattern. ./generic.ts's createVersionsOps
 *    threads the version row's own id through as the "owner" of its blocks
 *    and rels children, exactly the same shape createCollectionOps already
 *    used for the live table's own id - both now share one
 *    createBlocksRelsOps implementation.
 *
 * Phase 7 closed the last schema-generation gap: versioned ARRAY child
 * tables. Proven against Posts (the only versioned collection with a
 * top-level array field, `categories` - Posts also has `blocks`/nested
 * hasMany, on top of what Pages/Phase 6 already proved, so this is the
 * fullest single collection this data layer models yet). Confirmed against
 * real `_eg_posts_v_version_categories`:
 *
 *  - The TABLE name gets a "version_" infix before the field name
 *    (`_eg_posts_v_version_categories`, not `_eg_posts_v_categories`) -
 *    unlike blocks tables, which never get that infix at all
 *    (`_eg_pages_v_blocks_hero`, confirmed in Phase 6).
 *  - The subfield COLUMNS themselves stay unprefixed regardless
 *    (`.name`, not `.version_name`) - only the table name carries the
 *    "version_" marker.
 *  - Row identity is the same scheme Phase 6 established for blocks: an
 *    integer autoincrement `id` plus an extra `_uuid` text column, instead
 *    of the live table's string `id`, and `_parent_id` points at the
 *    VERSION ROW's own id, not the live document's.
 *
 * ./schema/generate.ts's generateArrayTable gained the same `versioned`
 * param generateBlockTables already had, and ./generic.ts's createArrayOps
 * (extracted from createCollectionOps' formerly-inline attachArrays/
 * writeArrays, mirroring createBlocksRelsOps' extraction in Phase 6) is what
 * lets createVersionsOps share that logic instead of reimplementing it.
 *
 * Phase 8 resolved `join` fields for real - the last schema-generation gap,
 * full stop (every phase before this one was about a column/child-table
 * SHAPE; a join field never gets a column at all). Proven against Events'
 * `rsvps`, this app's only join field, targeting EventRSVPs' own `event`
 * relationship column. Confirmed by creating a real Events document with 12
 * real EventRSVPs through Payload's own engine.create() and inspecting its
 * actual `findByID` response, not guessed: a join field resolves to
 * `{ docs: [...ids], hasNextPage }` - a plain array of related ids (this
 * data layer never resolves nested related documents for ANY relationship
 * field, join or otherwise, so this fits the existing convention rather
 * than introducing a depth concept nothing else here has), sorted by id
 * descending (newest related row first), page size 10, `hasNextPage` true
 * once an 11th matching row exists. ./generic.ts's createJoinOps resolves
 * this read-only at query time (Payload never accepts a write through a
 * join field either) - see its doc comment for the full shape and the
 * paging/sort/where options it deliberately does not implement (nothing in
 * this app's admin UI or API usage needs them yet).
 *
 * Phase 9 answered the draft/publish policy question Phase 8 left open -
 * the last thing standing between this data layer and being trustworthy
 * end-to-end. ./generic.ts's createDraftOps composes createCollectionOps +
 * createVersionsOps (rather than folding either apart, so every non-drafts
 * collection keeps using createCollectionOps exactly as already proven) into
 * the real policy, confirmed by creating/updating/publishing a real Events
 * document through Payload's own engine and inspecting exactly what it did
 * to both eg_events and _eg_events_v - not guessed:
 *
 *  - create() always writes the live row AND a mirroring version row
 *    (latest: true). `_status` defaults to 'draft' via the live column's own
 *    SQL default when unspecified, same as Payload's.
 *  - updateByID(id, data) with no `draft` flag - a normal/"publish" write -
 *    updates the live row AND creates a new version row mirroring the fresh
 *    live state, becoming the new latest (every older version for that
 *    parent flips to latest: false - `latest` is exclusive per parent,
 *    confirmed empirically).
 *  - updateByID(id, data, { draft: true }) creates a new latest version row
 *    ONLY, defaulting its `_status` to 'draft' even when layered on top of a
 *    published live doc. The live row is left completely untouched, not
 *    even updatedAt - confirmed: publishing, then doing a draft:true edit,
 *    left eg_events exactly as the publish had it.
 *  - findByID(id) with no `draft` flag reads the live row, unchanged.
 *  - findByID(id, { draft: true }) reads the latest version row instead -
 *    filtering on the `latest` column itself, which is what real Payload's
 *    own draft-resolution read does too (confirmed: it does not fall back to
 *    version-row insertion order when investigating a case where `latest`
 *    and insertion order briefly disagreed during testing).
 *
 * Proven against Events (this app's simplest drafts-enabled collection) in
 * both directions, matching the standing write-both-ways pattern: ours
 * writes checked through Payload's own findByID/findVersions, AND Payload's
 * own engine.create/engine.update (including real draft: true calls) checked
 * through findEventByID - see tests/int/cms-db-events-drafts.int.spec.ts.
 *
 * Getting there also surfaced a real, pre-existing bug unrelated to this
 * data layer: eg_locked_documents_rels (Payload's own table) is missing FK
 * columns for several collections added to this app's config after that
 * table was last migrated (audit-log, backups, translations,
 * membership-tiers, memberships), which makes checkDocumentLockStatus 500 on
 * EVERY engine.update()/engine.delete() call against a lockable collection.
 * Fixed locally to unblock this phase's testing; NOT yet applied to the
 * remote/production D1 - see
 * src/migrations/sql/20260906_000000_fix_locked_documents_rels_missing_columns.sql
 * for the fix and why it hasn't been run remotely yet.
 *
 * WHAT IS STILL OUT OF SCOPE, AND WHY IT IS HARDER
 *
 * Payload's real adapter (@payloadcms/drizzle) is a generic engine: given any
 * collection config it derives a drizzle schema and full CRUD, versions,
 * drafts and joins for it. Running this app's actual config through
 * `payload generate:db-schema` produces over 10,000 lines of table
 * definitions alone - that is the real size of the surface a from-scratch
 * generic replacement has to cover. Every field type this app's collections
 * actually use now has a proven live AND versioned shape, joins resolve for
 * real, and the draft/publish policy is settled - what's left is breadth,
 * not a gap in the approach:
 *
 *  - createDraftOps is now proven against Events (has a join field, no
 *    blocks) AND Pages (has blocks, no join field) - see
 *    tests/int/cms-db-pages-drafts.int.spec.ts. Posts/Courses (this app's
 *    remaining drafts-enabled collections) still need the same wiring
 *    (createDraftOps(createCollectionOps(...), createVersionsOps(...))) once
 *    src/engine/db.ts starts routing to them - nothing new to prove, just
 *    more collections to wire up and parity-test.
 *  - findMany does not support a `draft` flag - nothing in this app queries
 *    a LIST of drafts today; doing that right needs a per-row "latest
 *    version" subquery this data layer has no case to prove against yet.
 *
 * Next up: src/engine/db.ts can start being switched over collection by
 * collection - non-drafts collections route straight to createCollectionOps,
 * drafts-enabled ones wrap it in createDraftOps. Only once every collection
 * is switched over does removing the Payload dependency itself, and
 * rebuilding the admin UI in Tailwind, become real next steps rather than
 * premature ones.
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
export * from './collections/pages'
export * from './collections/posts'
