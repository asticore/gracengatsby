import type { Field } from '@/engine'

import { Faqs } from '@/collections/Faqs'
import { Media } from '@/collections/Media'
import { SiteTemplates } from '@/collections/SiteTemplates'
import { Forms } from '@/features/forms/collections/Forms'

import { generateBlockTables, generateRelsTable, generateTable, relationTargetSlugs, tableNameFor } from './generate'

/**
 * Tables for the `site-templates` collection, in their own file like ./formDrafts.ts so the
 * schema index is not edited. Same shape as Page Templates: a `blocks` field (one child table per
 * block type) and one shared `_rels` table for the hasMany/polymorphic targets inside those blocks.
 */
const generated = generateTable(SiteTemplates)
export const siteTemplates = generated.table

const [blocksField] = generated.blocksFields
const blockDefs = generateBlockTables(SiteTemplates.slug, generated.tableName, blocksField)

export const siteTemplatesBlocks = Object.fromEntries(blockDefs.map((block) => [block.slug, block.table]))

/** The targets the blocks above can reach through the _rels table. */
function resolveTargetTable(slug: string): string {
  if (slug === Faqs.slug) return tableNameFor(Faqs)
  if (slug === Media.slug) return tableNameFor(Media)
  if (slug === Forms.slug) return tableNameFor(Forms)
  throw new Error(`cms/db/schema: no known table for target collection "${slug}" - add it to resolveTargetTable in schema/siteTemplates.ts.`)
}

const relsFields = [...generated.relsFields, ...blockDefs.flatMap((block) => block.relsFields)]
const relsGenerated = generateRelsTable(generated.tableName, relsFields, resolveTargetTable)
export const siteTemplatesRels = relsGenerated.table

function singleTargetSlug(field: Field & { name: string }): string {
  const slugs = relationTargetSlugs(field)
  if (slugs.length !== 1) throw new Error(`siteTemplates: field "${field.name}" must target exactly one collection.`)
  return slugs[0]
}

/** Block slug -> { table, relsFieldTargets }, the shape the `blocksFields` option of the data layer wants. */
export const siteTemplatesBlockTypes = Object.fromEntries(
  blockDefs.map((block) => [
    block.slug,
    {
      table: block.table,
      relsFieldTargets: Object.fromEntries(block.relsFields.map((field) => [field.name, singleTargetSlug(field)])),
    },
  ]),
)

export const siteTemplatesRelsTargetColumns = relsGenerated.targetColumns
