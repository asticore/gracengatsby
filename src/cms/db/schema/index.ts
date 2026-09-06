import type { Field } from '@/engine'

import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core'

import { EventRSVPs } from '@/collections/EventRSVPs'
import { Events } from '@/collections/Events'
import { Faqs } from '@/collections/Faqs'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { PageTemplates } from '@/collections/PageTemplates'
import { Posts } from '@/collections/Posts'
import { MembershipTiers } from '@/features/members/collections/MembershipTiers'

import type { JoinFieldMeta } from './generate'
import { generateArrayTable, generateBlockTables, generateRelsTable, generateTable, generateVersionsTable, relationTargetSlugs, tableNameFor } from './generate'

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
