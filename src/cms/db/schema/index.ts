import type { Field } from '@/engine'

import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core'

import { EventRSVPs } from '@/collections/EventRSVPs'
import { Events } from '@/collections/Events'
import { Faqs } from '@/collections/Faqs'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { PageTemplates } from '@/collections/PageTemplates'
import { Posts } from '@/collections/Posts'
import { Users } from '@/collections/Users'
import { Courses } from '@/features/courses/collections/Courses'
import { Enrolments } from '@/features/courses/collections/Enrolments'
import { LessonProgress } from '@/features/courses/collections/LessonProgress'
import { Lessons } from '@/features/courses/collections/Lessons'
import { MembershipTiers } from '@/features/members/collections/MembershipTiers'

import type { JoinFieldMeta } from './generate'
import {
  generateArrayTable,
  generateBlockTables,
  generateRelsTable,
  generateSelectHasManyTable,
  generateTable,
  generateVersionsTable,
  relationTargetSlugs,
  tableNameFor,
} from './generate'

/**
 * Tables generated straight from the real collection configs, not
 * hand-copied - see ./generate.ts. Each addition here is the next-smallest
 * step up in field-type coverage over the last:
 *
 *  - Faqs: scalar fields only (phase 1/2).
 *  - EventRSVPs: adds a single-target relationship field, still one row per
 *    document (an `event_id` FK column, not a child table).
 *  - MembershipTiers: adds row-wrapped fields (flattened onto this table,
 *    same as Payload's own schema does) and an array field (`benefits`,
 *    which needs its own child table - see membershipTiersBenefits below).
 *  - PageTemplates: adds a `blocks` field (one child table per block type -
 *    see pageTemplatesBlocks below) and, inside two of those block types
 *    (Faq's `faqs`, Gallery's `images`), hasMany relationship/upload fields -
 *    these write into the collection's single shared `_rels` table
 *    (pageTemplatesRels) rather than becoming columns of their own. See
 *    ./generate.ts's generateBlockTables/generateRelsTable doc comments for
 *    the real D1 shapes this mirrors, confirmed by creating a real document
 *    through Payload's own engine and inspecting the resulling tables.
 */
const faqsGenerated = generateTable(Faqs)
export const faqs = faqsGenerated.table

/**
 * Phase 12: Media, this app's only upload-enabled collection - see
 * ./generate.ts's hasUpload/uploadColumns doc comment for the implicit
 * column shape this adds on top of Media's own single declared field
 * (`alt`). No group/array/blocks/join/versions, so this is otherwise the
 * same shape as Faqs (Phase 1/2) - the smallest collection this data layer
 * models, once the upload columns are accounted for.
 */
const mediaGenerated = generateTable(Media)
export const media = mediaGenerated.table

const eventRSVPsGenerated = generateTable(EventRSVPs)
export const eventRSVPs = eventRSVPsGenerated.table

const membershipTiersGenerated = generateTable(MembershipTiers)
export const membershipTiers = membershipTiersGenerated.table

const [benefitsField] = membershipTiersGenerated.arrayFields
export const membershipTiersBenefits = generateArrayTable(MembershipTiers.slug, membershipTiersGenerated.tableName, benefitsField)

const pageTemplatesGenerated = generateTable(PageTemplates)
export const pageTemplates = pageTemplatesGenerated.table

const [blocksField] = pageTemplatesGenerated.blocksFields
const pageTemplatesBlockDefs = generateBlockTables(PageTemplates.slug, pageTemplatesGenerated.tableName, blocksField)

export const pageTemplatesBlocks = Object.fromEntries(pageTemplatesBlockDefs.map((block) => [block.slug, block.table]))

/**
 * PageTemplates only ever references two other collections through
 * hasMany/polymorphic fields (Faq's `faqs`, Gallery's `images`) - resolved
 * here rather than in ./generate.ts, which does not import every collection
 * config, only the ones a given entry in this file actually needs.
 */
function resolveTargetTable(slug: string): string {
  if (slug === Faqs.slug) return tableNameFor(Faqs)
  if (slug === Media.slug) return tableNameFor(Media)
  throw new Error(`cms/db/schema: no known table for target collection "${slug}" - add it to resolveTargetTable in schema/index.ts.`)
}

const pageTemplatesRelsFields = [...pageTemplatesGenerated.relsFields, ...pageTemplatesBlockDefs.flatMap((block) => block.relsFields)]
const pageTemplatesRelsGenerated = generateRelsTable(pageTemplatesGenerated.tableName, pageTemplatesRelsFields, resolveTargetTable)
export const pageTemplatesRels = pageTemplatesRelsGenerated.table

/** Block slug -> { table, relsFieldTargets } - what ../generic.ts's `blocksFields` param wants for the `blocks` field. */
export const pageTemplatesBlockTypes = Object.fromEntries(
  pageTemplatesBlockDefs.map((block) => [
    block.slug,
    {
      table: block.table,
      relsFieldTargets: Object.fromEntries(block.relsFields.map((field) => [field.name, singleTargetSlug(field)])),
    },
  ]),
)

export const pageTemplatesRelsTargetColumns = pageTemplatesRelsGenerated.targetColumns

function singleTargetSlug(field: Field & { name: string }): string {
  const slugs = relationTargetSlugs(field)
  if (slugs.length !== 1) {
    throw new Error(`cms/db/schema: polymorphic relationTo on field "${field.name}" is not supported yet.`)
  }
  return slugs[0]
}

/**
 * Events: adds `group` fields (`location` - flattened onto this table with a
 * `location_` column prefix, confirmed against eg_events, and reconstructed
 * as a nested `location` object in the document shape) and `versions: {
 * drafts: true }` (the parallel `_eg_events_v` table - see
 * generateVersionsTable's doc comment for the real shape this mirrors).
 * Events also has a `join` field (`rsvps`) - Phase 5 left it unresolved (see
 * ./generate.ts's processFields doc comment at the time), and Events was
 * chosen over Pages/Posts/Courses specifically because it is the smallest
 * real versioned collection that does NOT also require blocks/array-in-
 * versions support (which generateVersionsTable did not build yet either)
 * or a working join to be usable. Phase 8 (below) resolves the join.
 */
export const eventsGenerated = generateTable(Events)
export const events = eventsGenerated.table
export const eventsVersions = generateVersionsTable(Events, eventsGenerated.tableName).table

/**
 * Phase 8: `join` fields resolved for real, closing the last gap in this
 * data layer's field-type coverage (everything else was closed by Phase 7).
 * Events' `rsvps` is this app's only join field - it targets EventRSVPs'
 * own `event` relationship column (confirmed: `field.collection` is
 * `event-rsvps`/EventRSVPs.slug, `field.on` is `event`, the exact JS
 * property key EventRSVPs' own generated table uses for that column - see
 * eventRSVPs above and ./generate.ts's columnFor, which keys a relationship
 * column by the field's own name, not a `<name>Id` suffix). Resolved
 * read-only at query time by ../generic.ts's createJoinOps - see its doc
 * comment for the confirmed `{ docs: [...ids], hasNextPage }` response shape
 * and paging default, proven against a real Events document with 12 real
 * EventRSVPs created through Payload's own engine.create().
 */
function resolveJoinTargetTable(slug: string): AnySQLiteTable {
  if (slug === EventRSVPs.slug) return eventRSVPs
  throw new Error(`cms/db/schema: no known table for join target collection "${slug}" - add it to resolveJoinTargetTable in schema/index.ts.`)
}

export const eventsJoinFields = Object.fromEntries(
  eventsGenerated.joinFields.map((field) => {
    const joinField = field as unknown as JoinFieldMeta
    return [joinField.name, { table: resolveJoinTargetTable(joinField.collection), onColumn: joinField.on }]
  }),
)

/**
 * Pages: adds versioned `blocks`/`_rels` child tables - the gap Events
 * (Phase 5's proof target) deliberately left open, since Events has no
 * `blocks` field. Pages' `blocks` field uses the same page-builder library as
 * PageTemplates (Faq's `faqs`, Gallery's `images` are its only
 * hasMany/polymorphic fields, both already covered by resolveTargetTable
 * above), so the live-table wiring below is a straight copy of
 * pageTemplates'/pageTemplatesBlocks'/pageTemplatesRels' shape.
 *
 * The versions side is new: generateVersionsTable now returns `blocksFields`/
 * `relsFields` too (see its doc comment), so generateBlockTables/
 * generateRelsTable are called again against the VERSIONS table's own name
 * (`pagesVersionsGenerated.tableName`, e.g. "_eg_pages_v") with
 * `versioned: true` - producing e.g. `_eg_pages_v_blocks_hero` (an integer
 * autoincrement `id` plus an extra `_uuid` column, confirmed against the real
 * table - see generateBlockTables' `versioned` param doc comment) and
 * `_eg_pages_v_rels` (identical shape to a live `_rels` table, just scoped to
 * version rows instead of live document rows - confirmed by direct D1
 * inspection, not guessed). Pages has no top-level array field, so
 * generateVersionsTable does not throw on the one gap it still has
 * (versioned array child tables - see its doc comment; Posts is the next
 * real target for that specific gap).
 */
export const pagesGenerated = generateTable(Pages)
export const pages = pagesGenerated.table

const [pagesBlocksField] = pagesGenerated.blocksFields
const pagesBlockDefs = generateBlockTables(Pages.slug, pagesGenerated.tableName, pagesBlocksField)
export const pagesBlocks = Object.fromEntries(pagesBlockDefs.map((block) => [block.slug, block.table]))

const pagesRelsFields = [...pagesGenerated.relsFields, ...pagesBlockDefs.flatMap((block) => block.relsFields)]
const pagesRelsGenerated = generateRelsTable(pagesGenerated.tableName, pagesRelsFields, resolveTargetTable)
export const pagesRels = pagesRelsGenerated.table

export const pagesBlockTypes = Object.fromEntries(
  pagesBlockDefs.map((block) => [
    block.slug,
    { table: block.table, relsFieldTargets: Object.fromEntries(block.relsFields.map((field) => [field.name, singleTargetSlug(field)])) },
  ]),
)
export const pagesRelsTargetColumns = pagesRelsGenerated.targetColumns

export const pagesVersionsGenerated = generateVersionsTable(Pages, pagesGenerated.tableName)
export const pagesVersions = pagesVersionsGenerated.table

const [pagesVersionsBlocksField] = pagesVersionsGenerated.blocksFields
const pagesVersionsBlockDefs = generateBlockTables(Pages.slug, pagesVersionsGenerated.tableName, pagesVersionsBlocksField, true, true)
export const pagesVersionsBlocks = Object.fromEntries(pagesVersionsBlockDefs.map((block) => [block.slug, block.table]))

const pagesVersionsRelsFields = [...pagesVersionsGenerated.relsFields, ...pagesVersionsBlockDefs.flatMap((block) => block.relsFields)]
const pagesVersionsRelsGenerated = generateRelsTable(pagesVersionsGenerated.tableName, pagesVersionsRelsFields, resolveTargetTable)
export const pagesVersionsRels = pagesVersionsRelsGenerated.table

export const pagesVersionsBlockTypes = Object.fromEntries(
  pagesVersionsBlockDefs.map((block) => [
    block.slug,
    { table: block.table, relsFieldTargets: Object.fromEntries(block.relsFields.map((field) => [field.name, singleTargetSlug(field)])) },
  ]),
)
export const pagesVersionsRelsTargetColumns = pagesVersionsRelsGenerated.targetColumns

/**
 * Posts: adds a versioned ARRAY field (`categories`) on top of everything
 * Pages already proved (versioned `blocks`/`_rels` - Posts' `layout` field
 * uses the same page-builder library) - the one remaining gap
 * generateVersionsTable had. Confirmed against real
 * `_eg_posts_v_version_categories`: table name gets a "version_" infix
 * before the field name (`_eg_posts_v_version_categories`, not
 * `_eg_posts_v_categories`) - unlike blocks tables, which never get that
 * infix - while the subfield COLUMNS themselves stay unprefixed
 * (`.name`, not `.version_name`). See generateArrayTable's `versioned`
 * param doc comment for the full shape (integer autoincrement `id` plus an
 * extra `_uuid` column, same scheme as versioned blocks).
 */
export const postsGenerated = generateTable(Posts)
export const posts = postsGenerated.table

const [postsCategoriesField] = postsGenerated.arrayFields
export const postsCategories = generateArrayTable(Posts.slug, postsGenerated.tableName, postsCategoriesField)

const [postsBlocksField] = postsGenerated.blocksFields
const postsBlockDefs = generateBlockTables(Posts.slug, postsGenerated.tableName, postsBlocksField)
export const postsBlocks = Object.fromEntries(postsBlockDefs.map((block) => [block.slug, block.table]))

const postsRelsFields = [...postsGenerated.relsFields, ...postsBlockDefs.flatMap((block) => block.relsFields)]
const postsRelsGenerated = generateRelsTable(postsGenerated.tableName, postsRelsFields, resolveTargetTable)
export const postsRels = postsRelsGenerated.table

export const postsBlockTypes = Object.fromEntries(
  postsBlockDefs.map((block) => [
    block.slug,
    { table: block.table, relsFieldTargets: Object.fromEntries(block.relsFields.map((field) => [field.name, singleTargetSlug(field)])) },
  ]),
)
export const postsRelsTargetColumns = postsRelsGenerated.targetColumns

export const postsVersionsGenerated = generateVersionsTable(Posts, postsGenerated.tableName)
export const postsVersions = postsVersionsGenerated.table

const [postsVersionsCategoriesField] = postsVersionsGenerated.arrayFields
export const postsVersionsCategories = generateArrayTable(Posts.slug, postsVersionsGenerated.tableName, postsVersionsCategoriesField, true, true)

const [postsVersionsBlocksField] = postsVersionsGenerated.blocksFields
const postsVersionsBlockDefs = generateBlockTables(Posts.slug, postsVersionsGenerated.tableName, postsVersionsBlocksField, true, true)
export const postsVersionsBlocks = Object.fromEntries(postsVersionsBlockDefs.map((block) => [block.slug, block.table]))

const postsVersionsRelsFields = [...postsVersionsGenerated.relsFields, ...postsVersionsBlockDefs.flatMap((block) => block.relsFields)]
const postsVersionsRelsGenerated = generateRelsTable(postsVersionsGenerated.tableName, postsVersionsRelsFields, resolveTargetTable)
export const postsVersionsRels = postsVersionsRelsGenerated.table

export const postsVersionsBlockTypes = Object.fromEntries(
  postsVersionsBlockDefs.map((block) => [
    block.slug,
    { table: block.table, relsFieldTargets: Object.fromEntries(block.relsFields.map((field) => [field.name, singleTargetSlug(field)])) },
  ]),
)
export const postsVersionsRelsTargetColumns = postsVersionsRelsGenerated.targetColumns

/**
 * Courses: the first collection this directory covers that was NOT already
 * covered at all before now (unlike Posts, which only needed a policy
 * already proven elsewhere wired on). Every field type Courses actually uses
 * was already proven by an earlier collection, so this needed no new
 * schema-generation capability, only wiring:
 *
 *  - `coverImage` (upload -> media) and `product` (relationship -> products)
 *    are both single-target, so - same as EventRSVPs' `event` (Phase 2) -
 *    they become plain FK columns on eg_courses itself, not a child table.
 *  - `seo` is the exact same group Pages already uses (metaTitle,
 *    metaDescription, ogImage, noIndex) - flattened with a `seo_` column
 *    prefix, ogImage a single-target FK column same as above (Phase 5).
 *  - `versions: { drafts: true }` - the parallel `_eg_courses_v` table
 *    (Phase 5).
 *  - `lessons` is a `join` field targeting Lessons' own `course` column
 *    (Phase 8's mechanism, same as Events' `rsvps` targeting EventRSVPs'
 *    `event`).
 *
 * Courses has no top-level array/blocks/hasMany field, so - unlike every
 * other versioned collection in this file - it needs no relsTable and no
 * arrayTables/blocksFields at all.
 *
 * Lessons itself is fully built out below (Phase 11) - `content`
 * blocks/`resources` array/rels - on top of the bare table this section
 * needs for the join. See Phase 11's own doc comment further down.
 */
export const coursesGenerated = generateTable(Courses)
export const courses = coursesGenerated.table
export const coursesVersions = generateVersionsTable(Courses, coursesGenerated.tableName).table

export const lessonsGenerated = generateTable(Lessons)
export const lessons = lessonsGenerated.table

function resolveCoursesJoinTargetTable(slug: string): AnySQLiteTable {
  if (slug === Lessons.slug) return lessons
  throw new Error(`cms/db/schema: no known table for join target collection "${slug}" - add it to resolveCoursesJoinTargetTable in schema/index.ts.`)
}

/**
 * Parses a Payload `sort` string (bare name = ascending, `-`-prefixed =
 * descending - Payload's own convention) into what ../generic.ts's
 * createJoinOps wants. Courses' `lessons` join field declares
 * `defaultSort: 'order'` of its own (see Courses.ts) - confirmed by
 * inspection that real Payload honors THIS, not a generic id-descending
 * default, for a join field's read order (see createJoinOps' doc comment).
 * Undefined (no defaultSort on the field) leaves createJoinOps' own
 * id-descending default in place, unchanged - that's what reproduces the
 * previously-confirmed Events `rsvps` behaviour.
 */
function joinSortFrom(defaultSort: string | undefined): { column: string; direction: 'asc' | 'desc' } | undefined {
  if (!defaultSort) return undefined
  return defaultSort.startsWith('-') ? { column: defaultSort.slice(1), direction: 'desc' } : { column: defaultSort, direction: 'asc' }
}

export const coursesJoinFields = Object.fromEntries(
  coursesGenerated.joinFields.map((field) => {
    const joinField = field as unknown as JoinFieldMeta
    return [
      joinField.name,
      { table: resolveCoursesJoinTargetTable(joinField.collection), onColumn: joinField.on, sort: joinSortFrom(joinField.defaultSort) },
    ]
  }),
)

/**
 * Phase 11: Lessons built out as a full live collection (no versions - the
 * config declares none, unlike its sibling Courses). Closes the gap Phase 10
 * deliberately left open (see Courses' own doc comment above): `lessonsGenerated`
 * already existed for the join, but its `content` blocks field and `resources`
 * array field were never processed beyond the bare table.
 *
 *  - `resources` is a plain array field (label text + `file` upload->media,
 *    single-target so it's a plain FK column on the array's own child table,
 *    not a rels row) - same mechanism as MembershipTiers' `benefits`.
 *  - `content` uses the exact same page-builder block library as Pages/Posts/
 *    PageTemplates - Faq's `faqs` (hasMany relationship->faqs) and Gallery's
 *    `images` (hasMany upload->media) are its only hasMany/polymorphic fields,
 *    both already covered by resolveTargetTable above, so this is a straight
 *    copy of pageTemplates'/pageTemplatesBlocks'/pageTemplatesRels' shape.
 *  - Lessons has no top-level array/blocks in `versions` because Lessons has
 *    no versions at all - no `_v` sibling tables here, unlike Pages/Posts.
 */
const [lessonsResourcesField] = lessonsGenerated.arrayFields
export const lessonsResources = generateArrayTable(Lessons.slug, lessonsGenerated.tableName, lessonsResourcesField)

const [lessonsContentField] = lessonsGenerated.blocksFields
const lessonsContentBlockDefs = generateBlockTables(Lessons.slug, lessonsGenerated.tableName, lessonsContentField)
export const lessonsContentBlocks = Object.fromEntries(lessonsContentBlockDefs.map((block) => [block.slug, block.table]))

const lessonsRelsFields = [...lessonsGenerated.relsFields, ...lessonsContentBlockDefs.flatMap((block) => block.relsFields)]
const lessonsRelsGenerated = generateRelsTable(lessonsGenerated.tableName, lessonsRelsFields, resolveTargetTable)
export const lessonsRels = lessonsRelsGenerated.table

export const lessonsContentBlockTypes = Object.fromEntries(
  lessonsContentBlockDefs.map((block) => [
    block.slug,
    { table: block.table, relsFieldTargets: Object.fromEntries(block.relsFields.map((field) => [field.name, singleTargetSlug(field)])) },
  ]),
)
export const lessonsRelsTargetColumns = lessonsRelsGenerated.targetColumns

/**
 * Phase 13: Enrolments and LessonProgress - Courses' remaining sibling
 * collections (flagged unchecked since Phase 11) - close out the Courses
 * family. Both are pure wiring, no new schema-generation capability: every
 * field either is a single-target `relationship` (to `users`, Courses, or
 * Lessons - a plain `<name>_id` FK column, EventRSVPs' own Phase 2
 * mechanism; `users` itself is not modeled anywhere in this data layer, but
 * a single-target FK column never needs its target table resolved at
 * schema-generation time, only at query time if something joined against
 * it, which nothing here does) or a plain scalar (`select`, `date`,
 * `checkbox`) already proven. Neither has group/array/blocks/join/versions.
 */
export const enrolmentsGenerated = generateTable(Enrolments)
export const enrolments = enrolmentsGenerated.table

export const lessonProgressGenerated = generateTable(LessonProgress)
export const lessonProgress = lessonProgressGenerated.table

/**
 * Phase 14: Users - `auth: true`, this app's biggest remaining single-collection
 * gap, and the last collection every other Phase's FK-fixture rows (Enrolments/
 * LessonProgress's `user` column, EventRSVPs, etc.) had been pointing at without
 * ever modeling itself. Two genuinely new schema-generation capabilities, not
 * wiring-only:
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
 */
export const usersGenerated = generateTable(Users)
export const users = usersGenerated.table

const [usersRolesField] = usersGenerated.selectFields
export const usersRoles = generateSelectHasManyTable(usersGenerated.tableName, usersRolesField)
