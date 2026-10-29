/**
 * Which fields on which collections are worth translating.
 *
 * Deliberately a hand-written list rather than a walk of each collection's
 * field config. Most fields on a document should not be translated - dates,
 * prices, relationships, image references, booleans - and a generic
 * walker that offers all of them buries the six fields that matter under sixty
 * that do not. Naming them is a minute's work per collection and produces a
 * screen somebody can actually finish.
 *
 * `path` is a dot path into the document. Rich text is addressed by its field
 * name and handled as plain text at the edges (see `store.ts`): translating a
 * whole Lexical tree in a table cell is not something anybody wants to do, so
 * the table offers the flattened text and the front end substitutes it as a
 * single block. That is a deliberate limitation, stated here so it is not
 * mistaken for a bug.
 */

import { blockTextAddresses, type BlockGroup } from './blockText'
import { richTextSubFields } from './richText'
import { parseTiers, tierPath } from '@/features/editScreens/tiers'

/** The field path of a document's slug, when it is translatable (see localizedSlugs.ts). */
export const SLUG_FIELD = 'slug'

export type TranslatableFieldDef = {
  path: string
  label: string
  /** 'text' renders one line, 'long' a textarea. */
  size: 'text' | 'long'
  /** True where the source value is a rich-text tree rather than a string. */
  richText?: boolean
  /** Set on block text (see blockText.ts): the block this field belongs to. */
  group?: BlockGroup
}

export type TranslatableSourceDef = {
  /** Collection slug, matching the engine's own. */
  slug: string
  label: string
  /** Which document field to show in the picker. */
  titleField: string
  /** The document field holding page-builder blocks, when the collection has them. */
  blocksField?: string
  /** Hand-written fields that are always translatable (block text is added per document). */
  fields: TranslatableFieldDef[]
  /** A JSON array of tiers whose `name` and `description` are translatable, keyed by tier id. */
  tiersField?: string
}

export const TRANSLATABLE_COLLECTIONS: TranslatableSourceDef[] = [
  {
    slug: 'pages',
    label: 'Pages',
    titleField: 'title',
    blocksField: 'blocks',
    fields: [
      { path: 'title', label: 'Title', size: 'text' },
      // A translated slug is the URL segment in that language (see localizedSlugs.ts).
      { path: 'slug', label: 'Slug', size: 'text' },
      { path: 'seo.metaTitle', label: 'SEO title', size: 'text' },
      { path: 'seo.metaDescription', label: 'SEO description', size: 'long' },
    ],
  },
  {
    slug: 'posts',
    label: 'Posts',
    titleField: 'title',
    blocksField: 'layout',
    fields: [
      { path: 'title', label: 'Title', size: 'text' },
      { path: 'slug', label: 'Slug', size: 'text' },
      { path: 'excerpt', label: 'Excerpt', size: 'long' },
      { path: 'content', label: 'Body', size: 'long', richText: true },
      { path: 'seo.metaTitle', label: 'SEO title', size: 'text' },
      { path: 'seo.metaDescription', label: 'SEO description', size: 'long' },
    ],
  },
  {
    slug: 'products',
    label: 'Products',
    titleField: 'title',
    blocksField: 'layout',
    fields: [
      { path: 'title', label: 'Title', size: 'text' },
      { path: 'slug', label: 'Slug', size: 'text' },
      { path: 'description', label: 'Description', size: 'long', richText: true },
      { path: 'seo.metaTitle', label: 'SEO title', size: 'text' },
      { path: 'seo.metaDescription', label: 'SEO description', size: 'long' },
    ],
  },
  {
    slug: 'events',
    label: 'Events',
    titleField: 'title',
    fields: [
      { path: 'title', label: 'Title', size: 'text' },
      { path: 'summary', label: 'Summary', size: 'long' },
      { path: 'description', label: 'Description', size: 'long', richText: true },
      { path: 'location.venueName', label: 'Venue name', size: 'text' },
      { path: 'location.address', label: 'Address', size: 'long' },
    ],
    tiersField: 'ticketTiers',
  },
  {
    // A reusable section is translated once, here, and applied wherever it is embedded.
    slug: 'reusable-sections',
    label: 'Reusable section',
    titleField: 'name',
    blocksField: 'blocks',
    fields: [
      { path: 'name', label: 'Name', size: 'text' },
      { path: 'description', label: 'Description', size: 'long' },
    ],
  },
  {
    slug: 'faqs',
    label: 'FAQs',
    titleField: 'question',
    fields: [
      { path: 'question', label: 'Question', size: 'text' },
      { path: 'answer', label: 'Answer', size: 'long', richText: true },
      { path: 'category', label: 'Category', size: 'text' },
    ],
  },
]

const BY_SLUG = new Map(TRANSLATABLE_COLLECTIONS.map((entry) => [entry.slug, entry]))

export const translatableSource = (slug: string): TranslatableSourceDef | undefined => BY_SLUG.get(slug)

/**
 * Every translatable field of one document: the fixed fields above, then the
 * text inside its builder blocks, in document order. Block text depends on the
 * document, so callers that list, edit, draft or overlay a document use this
 * rather than `source.fields`. Empty source text is still returned here; the
 * callers filter it, as they always have.
 */
export function fieldsForDocument(slug: string, doc: unknown): TranslatableFieldDef[] {
  const source = translatableSource(slug)
  if (!source) return []
  const fixed = source.fields.flatMap((field) => (field.richText ? richTextFieldsFor(field, doc) : [field]))
  if (source.tiersField) fixed.push(...tierFieldsFor(doc, source.tiersField))
  if (!source.blocksField) return fixed
  const blockFields: TranslatableFieldDef[] = blockTextAddresses(doc, source.blocksField).map((address) => ({
    path: address.fieldPath,
    label: address.label,
    size: address.size,
    group: address.group,
  }))
  return [...fixed, ...blockFields]
}

/**
 * Name and description of each saved tier, keyed by its stable id. A tier without
 * an id (saved before ids were assigned) is not listed until it is saved again.
 */
function tierFieldsFor(doc: unknown, tiersField: string): TranslatableFieldDef[] {
  const value = doc && typeof doc === 'object' ? (doc as Record<string, unknown>)[tiersField] : undefined
  const out: TranslatableFieldDef[] = []
  for (const tier of parseTiers(value)) {
    if (!tier.id) continue
    const group = { key: tiersField, blockType: 'ticketTier', blockLabel: 'Ticket tiers', preview: tier.name.slice(0, 60) }
    out.push({ path: tierPath(tier.id, 'name'), label: `${tier.name} · Name`, size: 'text', group })
    if (tier.description.trim()) {
      out.push({ path: tierPath(tier.id, 'description'), label: `${tier.name} · Description`, size: 'long', group })
    }
  }
  return out
}

/**
 * A rich text field becomes one plain sub-field per text node (see richText.ts),
 * grouped under the field so the translate panel shows them together.
 */
function richTextFieldsFor(field: TranslatableFieldDef, doc: unknown): TranslatableFieldDef[] {
  const value = doc && typeof doc === 'object' ? (doc as Record<string, unknown>)[field.path] : undefined
  return richTextSubFields({ field: field.path, label: field.label, value }).map((sub) => ({
    path: sub.path,
    label: sub.label,
    size: sub.size,
    group: {
      key: field.path,
      blockType: 'richText',
      blockLabel: field.label,
      preview: sub.text.trim().replace(/\s+/g, ' ').slice(0, 60),
    },
  }))
}

/** `<collection>:<document id>` - the value stored in `eg_translations.source_id`. */
export const sourceIdFor = (slug: string, documentId: string | number): string => `${slug}:${documentId}`
