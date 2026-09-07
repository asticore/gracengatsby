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
 * Phase 10 brought Courses in from zero - the one collection Phase 9's own
 * notes had flagged as needing the full treatment, not a one-line
 * createDraftOps wiring. In the end it needed no NEW schema-generation
 * capability at all: every field type Courses uses (single-target
 * relationship/upload -> plain FK column, the same `seo` group Pages already
 * uses, `versions: { drafts: true }`, and a `join` field targeting another
 * collection's own relationship column) had already been proven by an
 * earlier collection. What Courses added was its own schema/ops file
 * (schema/index.ts's courses/coursesVersions/coursesJoinFields,
 * collections/courses.ts) - see tests/int/cms-db-courses.int.spec.ts (live
 * CRUD, group field, join field) and
 * tests/int/cms-db-courses-drafts.int.spec.ts (draft/publish parity, same
 * five cases proven against Events/Pages/Posts).
 *
 * Courses' `lessons` join targets Lessons' own `course` column, so
 * schema/index.ts generates a bare `lessons` table (generateTable(Lessons))
 * purely so the join has something to SELECT against - Phase 10 stopped
 * there deliberately.
 *
 * Phase 11 finishes the job: Lessons is now a full live collection (no
 * versions - the config declares none, unlike Courses). `content` (the same
 * page-builder block library as Pages/Posts/PageTemplates) and `resources`
 * (a plain array field, MembershipTiers' `benefits` mechanism) are both
 * built out - schema/index.ts's lessonsResources/lessonsContentBlocks/
 * lessonsRels, collections/lessons.ts. Proven against real Payload in
 * tests/int/cms-db-lessons.int.spec.ts: required `course` FK column, the
 * `resources` array, and `content` blocks mixing a hasMany relationship
 * (Faq's `faqs`) and a hasMany upload (Gallery's `images`) into one ordered
 * list, matching cms-db-page-templates.int.spec.ts's proof shape. One
 * naming quirk confirmed along the way: a blocks field's child tables are
 * always named "<dbName>_blocks_<blockSlug>" - Lessons' field is named
 * `content`, yet its tables are `eg_lessons_blocks_*`, not
 * `eg_lessons_content_*` (see generate.ts's generateBlockTables - already
 * correctly implemented; Posts' `layout` field relies on the same fixed
 * "blocks" segment for `eg_posts_blocks_hero`, so nothing needed to change,
 * this was only a surprise when hand-writing the new test's raw-SQL cleanup
 * query).
 *
 * Building the `lessons` join also corrected Phase 8's join-ordering claim:
 * "sorted by id descending" was only ever true because EventRSVPs' `event`
 * join field (Events' `rsvps`) declares no `defaultSort` of its own.
 * Courses' `lessons` join field DOES declare one (`defaultSort: 'order'`,
 * see Courses.ts), and real Payload honors THAT instead - confirmed by
 * creating 11 real Lessons with `order` values deliberately NOT matching
 * creation sequence and inspecting Payload's actual response: sorted by
 * `order` ascending, not by id. ./generic.ts's createJoinOps now takes each
 * join field's own optional sort column/direction (parsed from its
 * `defaultSort` string in schema/index.ts's joinSortFrom), defaulting to the
 * previously-confirmed `{ column: 'id', direction: 'desc' }` when a join
 * field declares none - Events' `rsvps` is unaffected, still id-descending.
 *
 * Phase 12 modeled Media - a genuinely new schema-generation capability, not
 * another wiring-only phase like Courses/Lessons: `upload: {...}` on a
 * collection config (Media is the only one in this app) adds columns
 * Payload generates itself, entirely outside that collection's own `fields`
 * list, so nothing before this phase had a reason to look at
 * `collection.upload` at all. Confirmed against the real eg_media schema
 * (`pragma table_info`, not guessed): `url`, `thumbnailURL` (column
 * `thumbnail_u_r_l` - `to-snake-case`, already used everywhere else in this
 * file, happens to split each capital of "URL" into its own segment),
 * `filename`, `mimeType`, `filesize`, `width`, `height` - all nullable, the
 * numeric three using the same `numeric(..., {mode:'number'})` any Payload
 * `number` field already gets, landing in real column order right after
 * `updatedAt`/`createdAt`. ./schema/generate.ts's generateTable now checks
 * `hasUpload(collection)` and merges in `uploadColumns()` when true.
 *
 * Proven against a REAL upload, not a bare `data` write: Payload's Local API
 * `file` option (a real 1x1 PNG buffer), backed by this app's real R2
 * binding in local dev (src/engine/storage.ts) - confirmed
 * width/height/filesize come back exactly matching the real file, and that
 * `thumbnailURL` is null with no `imageSizes`/`focalPoint` configured (this
 * app's actual Media.ts sets `crop: false, focalPoint: false`, no
 * `imageSizes`) - see tests/int/cms-db-media.int.spec.ts. Deliberately NOT
 * modeled, and generateTable throws rather than guessing if a future
 * collection needs them: `imageSizes` (per-size `sizes_*` columns) and
 * `focalPoint: true` (`focalX`/`focalY` columns) - and an upload-enabled
 * collection combined with drafts, since nothing in this app's real config
 * exercises that combination to confirm column order/shape against.
 *
 * This data layer does not perform an actual file upload itself
 * (storage/resizing stays Payload's own upload handler's job, outside any
 * phase's scope so far) - collections/media.ts only mirrors the columns a
 * real upload (or a plain write, for collections/media.ts's own
 * create/update) produces.
 *
 * Phase 13 closed out the Courses family: Enrolments and LessonProgress
 * (flagged unchecked since Phase 11) needed no new capability either - every
 * field is a single-target `relationship` (to `users`, Courses, or Lessons -
 * a plain FK column, EventRSVPs' Phase 2 mechanism) or a plain scalar
 * (`select`, `date`, `checkbox`). `users` itself is not modeled anywhere in
 * this data layer (Users is `auth: true` - a materially bigger gap: login
 * credentials, salts/hashes, lockout columns, none of it declared in the
 * collection's own `fields` any more than Media's upload columns were,
 * possibly its own future phase along those lines) - but a single-target FK
 * column never needs its target table resolved at schema-generation time,
 * only at query time if something joined against it, which nothing here
 * does. Proven with one real user created through Payload's own auth
 * `create()` purely as a valid FK target - see
 * tests/int/cms-db-enrolments-lesson-progress.int.spec.ts.
 *
 * Phase 14 modeled Users - `auth: true`, the collection every earlier phase's
 * FK-fixture rows (Enrolments/LessonProgress's `user` column, etc.) had been
 * pointing at without ever modeling itself, and the biggest single-collection
 * gap flagged since Phase 9. Two genuinely new schema-generation capabilities:
 *
 *  - `auth: true`'s implicit columns (email, password/reset/lockout/two-factor)
 *    - see ../schema/generate.ts's hasAuth/authColumns doc comment for the
 *    confirmed real eg_users shape and what's deliberately NOT modeled (the
 *    `eg_users_sessions` child table - Payload only ever writes there during
 *    its own login flow, which this data layer does not implement).
 *  - Users' own `roles` field: a hasMany `select`, needing its own child-table
 *    shape distinct from both an array field's and a rels field's - see
 *    generateSelectHasManyTable's doc comment. Confirmed against the real
 *    eg_users_roles table: `order`/`parent_id` (no underscore prefix, unlike
 *    every array/blocks child table in this app) and a single `value` column,
 *    one row per selected role, in order.
 *
 * Proven with a real user created and read back through Payload's own Local
 * API (`engine.create`/`engine.findByID`) - see tests/int/cms-db-users.int.spec.ts.
 * Also surfaced a real, pre-existing latent bug in ../generic.ts's
 * createCollectionOps: a `defaultValue` was being merged into the flat insert
 * `values` AFTER splitSpecialFields ran, which only worked because no
 * defaultValue in this app before Users' `roles: ['customer']` ever targeted a
 * special (array/rels/blocks/select) field. Fixed by merging defaults into
 * `data` BEFORE splitting, so a default for any field type goes through the
 * same split/write path a caller-supplied value would.
 *
 * Phase 15 modeled AuditLog and Backups - both scalar-only (text/number/date/
 * textarea), same shape class as Faqs, so no new schema-generation capability
 * was needed; confirmed against the real eg_audit_log/eg_backups tables via
 * `pragma table_info` and the columns line up 1:1 with what generateTable
 * derives from each collection's own `fields` list (unlike the
 * eg_locked_documents_rels drift noted below, these two hand-written
 * migrations were never allowed to drift from their collection configs).
 * Both collections close `access.create`/`update` to everyone, including
 * admins, in their own Payload config - rows are meant to arrive only by
 * direct insert from the feature code that logs to them (auditLog.ts's
 * writer, backups' own record.ts) - but that is an access-control fact, not
 * a schema one: Payload's Local API overrides access by default, so the
 * usual write-both-ways parity tests apply unchanged (see
 * tests/int/cms-db-audit-log.int.spec.ts and
 * tests/int/cms-db-backups.int.spec.ts). One shape note worth recording:
 * eg_backups' `status`/`size_bytes`/`tables_backed_up`/`media_objects`
 * columns carry a SQL-level DEFAULT with no matching Payload `defaultValue` -
 * harmless, since this data layer (like Payload's own insert path) only ever
 * inserts columns a caller actually supplies, so an omitted column falls
 * through to the same DB default either way.
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
 *  - createDraftOps is now proven against Events (join field, no blocks),
 *    Pages (blocks, no join field), Posts (versioned array field, no join
 *    field), AND Courses (group field + join field, no blocks/array) - see
 *    tests/int/cms-db-pages-drafts.int.spec.ts,
 *    tests/int/cms-db-posts-drafts.int.spec.ts, and
 *    tests/int/cms-db-courses-drafts.int.spec.ts. That is every
 *    drafts-enabled collection this app's config declares
 *    (Events/Pages/Posts/Courses) - nothing left needing this policy.
 *  - Lessons (src/features/courses/collections/Lessons.ts) is now fully
 *    built out (Phase 11) - live CRUD, `content` blocks, `resources` array.
 *    It is NOT drafts-enabled, so createDraftOps was never a question here.
 *    Its sibling collections Enrolments/LessonProgress are now built out too
 *    (Phase 13) - the whole Courses family (Courses/Lessons/Enrolments/
 *    LessonProgress) is fully covered.
 *  - findMany does not support a `draft` flag - nothing in this app queries
 *    a LIST of drafts today; doing that right needs a per-row "latest
 *    version" subquery this data layer has no case to prove against yet.
 *  - Media (Phase 12) is this app's only upload-enabled collection, so
 *    `imageSizes` and `focalPoint: true` remain unproven (see Phase 12's own
 *    note above) - not a gap unless a future collection actually turns
 *    either on.
 *  - Users (Phase 14) is this app's only auth-enabled collection, so
 *    `eg_users_sessions` remains unmodeled (see Phase 14's own note above) -
 *    not a gap unless this data layer ever needs to implement login/session
 *    issuance itself, which is a Payload-auth-strategy question, not a
 *    schema-generation one.
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
export * from './collections/media'
export * from './collections/eventRSVPs'
export * from './collections/membershipTiers'
export * from './collections/pageTemplates'
export * from './collections/events'
export * from './collections/pages'
export * from './collections/posts'
export * from './collections/courses'
export * from './collections/lessons'
export * from './collections/enrolments'
export * from './collections/lessonProgress'
export * from './collections/users'
export * from './collections/auditLog'
export * from './collections/backups'
