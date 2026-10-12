import type { CustomFieldDef, CustomFieldType, FieldGroupDoc } from '@/fields/customFields/types'
import { couldApplyToCollection } from '@/features/customFields/location'

import type { CellFormat, Cell } from './types'

/**
 * Which fields a view may show, filter or sort by.
 *
 * Built-in fields are an explicit allow-list per collection: anything not listed here (cost prices,
 * stock counts, authors' emails, password hashes, draft content) can never be picked, whatever a
 * stored view or a crafted request names. Custom fields are offered only when their definition is of a
 * plain value type and their name does not start with an underscore (a name starting with `_` marks a
 * private field). Every choice carries a friendly label.
 */

export type FieldKind = 'text' | 'number' | 'date' | 'boolean'

export type FieldInfo = {
  /** Stable key stored in a view: a built-in name, or `cf:<custom field name>`. */
  key: string
  label: string
  kind: FieldKind
  origin: 'built-in' | 'custom'
  /** Format offered by default. */
  defaultFormat: CellFormat
  /** Extra detail for the picker, for example the Extra fields set a field came from. */
  hint?: string
}

type BuiltIn = FieldInfo & { path: string; join?: boolean }

const t = (key: string, label: string, extra: Partial<BuiltIn> = {}): BuiltIn => ({ key, label, kind: 'text', origin: 'built-in', defaultFormat: 'auto', path: key, ...extra })
const d = (key: string, label: string, extra: Partial<BuiltIn> = {}): BuiltIn => t(key, label, { kind: 'date', defaultFormat: 'date', ...extra })
const n = (key: string, label: string, extra: Partial<BuiltIn> = {}): BuiltIn => t(key, label, { kind: 'number', defaultFormat: 'number', ...extra })
const b = (key: string, label: string, extra: Partial<BuiltIn> = {}): BuiltIn => t(key, label, { kind: 'boolean', ...extra })

export type SourceCollection = {
  slug: string
  label: string
  /** Versioned collections have a published status: only published documents are ever used. */
  versioned: boolean
  /** Built-in field that the "category" filter compares with, if any. */
  categoryField: string | null
  /** Engine sort key used when reading. */
  readSort: string
  fields: BuiltIn[]
}

/** Collections a view can read. Every one carries Extra fields (custom fields). */
export const SOURCE_COLLECTIONS: SourceCollection[] = [
  {
    slug: 'pages',
    label: 'Pages',
    versioned: true,
    categoryField: null,
    readSort: '-updatedAt',
    fields: [t('title', 'Title'), t('slug', 'Address (slug)'), d('updatedAt', 'Last updated'), d('createdAt', 'Created')],
  },
  {
    slug: 'posts',
    label: 'Blog posts',
    versioned: true,
    categoryField: 'categories',
    readSort: '-publishedDate',
    fields: [
      t('title', 'Title'),
      t('slug', 'Address (slug)'),
      d('publishedDate', 'Published date'),
      t('excerpt', 'Excerpt'),
      t('categories', 'Categories', { join: true }),
      d('updatedAt', 'Last updated'),
    ],
  },
  {
    slug: 'products',
    label: 'Products',
    versioned: true,
    categoryField: 'category',
    readSort: 'title',
    fields: [
      t('title', 'Name'),
      t('slug', 'Address (slug)'),
      t('category', 'Category'),
      t('productType', 'Product type'),
      n('priceInAUD', 'Price', { defaultFormat: 'currency' }),
      n('salePrice', 'Sale price', { defaultFormat: 'currency' }),
      t('sku', 'SKU'),
      t('stockStatus', 'Stock status'),
      t('shortDescription', 'Short description'),
      d('updatedAt', 'Last updated'),
    ],
  },
  {
    slug: 'events',
    label: 'Events',
    versioned: true,
    categoryField: 'eventType',
    readSort: 'startDate',
    fields: [
      t('title', 'Title'),
      t('slug', 'Address (slug)'),
      d('startDate', 'Starts'),
      d('endDate', 'Ends'),
      t('summary', 'Summary'),
      t('location.venueName', 'Venue', { path: 'location.venueName' }),
      t('location.address', 'Address', { path: 'location.address' }),
      b('location.isOnline', 'Online event', { path: 'location.isOnline' }),
      t('eventType', 'Event type'),
      n('capacity', 'Capacity'),
    ],
  },
  {
    slug: 'faqs',
    label: 'FAQs',
    versioned: false,
    categoryField: 'category',
    readSort: 'order',
    fields: [t('question', 'Question'), t('category', 'Category'), n('order', 'Order')],
  },
]

export const SOURCE_COLLECTION_MAP: Record<string, SourceCollection> = Object.fromEntries(SOURCE_COLLECTIONS.map((c) => [c.slug, c]))

export const isSourceCollection = (slug: string): boolean => Object.prototype.hasOwnProperty.call(SOURCE_COLLECTION_MAP, slug)

/** Custom field types that hold one plain value and can sit in a table cell. */
const SELECTABLE_TYPES = new Set<CustomFieldType>(['text', 'textarea', 'number', 'checkbox', 'select', 'radio', 'button-group', 'url', 'email', 'phone', 'date', 'datetime', 'time', 'color'])

export const CUSTOM_PREFIX = 'cf:'

/** A custom field name that marks the field private. It is never offered and never read. */
export const isPrivateName = (name: string): boolean => name.startsWith('_')

export function isSelectableCustomField(def: CustomFieldDef): boolean {
  return SELECTABLE_TYPES.has(def.type) && Boolean(def.name) && !isPrivateName(def.name) && /^[A-Za-z0-9_-]{1,80}$/.test(def.name) && !(def.multiple === true)
}

const customKind = (def: CustomFieldDef): FieldKind => (def.type === 'number' ? 'number' : def.type === 'date' || def.type === 'datetime' ? 'date' : def.type === 'checkbox' ? 'boolean' : 'text')

/** Everything a view on `collection` may use: built-in fields first, then custom fields from groups that could apply. */
export function buildCatalogue(collection: string, groups: FieldGroupDoc[]): FieldInfo[] {
  const source = SOURCE_COLLECTION_MAP[collection]
  if (!source) return []
  const out: FieldInfo[] = source.fields.map(({ key, label, kind, origin, defaultFormat }) => ({ key, label, kind, origin, defaultFormat }))
  const seen = new Set(out.map((f) => f.key))
  for (const group of groups) {
    if (!couldApplyToCollection(group.location, collection)) continue
    for (const def of group.fields) {
      if (!isSelectableCustomField(def)) continue
      const key = `${CUSTOM_PREFIX}${def.name}`
      if (seen.has(key)) continue
      seen.add(key)
      const kind = customKind(def)
      out.push({ key, label: def.label || def.name, kind, origin: 'custom', defaultFormat: kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'auto', hint: group.name })
    }
  }
  return out
}

const getPath = (doc: Record<string, unknown>, path: string): unknown => {
  let current: unknown = doc
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Reads one built-in field from a document as a plain cell. Unknown keys give null. */
export function readBuiltIn(collection: string, key: string, doc: Record<string, unknown>): Cell {
  const field = SOURCE_COLLECTION_MAP[collection]?.fields.find((f) => f.key === key)
  if (!field) return null
  const value = getPath(doc, field.path)
  if (value === undefined || value === null || value === '') return null
  if (field.join) {
    if (!Array.isArray(value)) return null
    const names = value.map((v) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : String(v))).filter(Boolean)
    return names.length ? names.join(', ') : null
  }
  if (field.kind === 'boolean') return value === true ? 'Yes' : value === false ? 'No' : null
  if (field.kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

/** True when the key names a built-in field of the collection. */
export const isBuiltInKey = (collection: string, key: string): boolean => Boolean(SOURCE_COLLECTION_MAP[collection]?.fields.some((f) => f.key === key))

/** True when a "category" document value matches a wanted category name (arrays are searched). */
export function categoryMatches(collection: string, doc: Record<string, unknown>, wanted: string): boolean {
  if (!wanted) return true
  const field = SOURCE_COLLECTION_MAP[collection]?.categoryField
  if (!field) return true
  const value = doc[field]
  const want = wanted.trim().toLowerCase()
  if (Array.isArray(value)) return value.some((v) => String(v && typeof v === 'object' ? (v as { name?: unknown }).name ?? '' : v).trim().toLowerCase() === want)
  return typeof value === 'string' && value.trim().toLowerCase() === want
}
