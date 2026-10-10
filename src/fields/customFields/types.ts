/**
 * Shapes shared by the Field Group builder, the custom fields panel, the
 * server validation hook and the merge-tag stringifier.
 *
 * A Field Group's `definition` is a list of CustomFieldDef. Values are stored in
 * the owning document's single `customFields` JSON column, keyed by the
 * top-level `name`; nested fields (group / repeater / flexible) store objects or
 * arrays under that same key.
 */

export const CUSTOM_FIELD_TYPES = [
  'text',
  'textarea',
  'wysiwyg',
  'number',
  'checkbox',
  'select',
  'radio',
  'button-group',
  'image',
  'file',
  'gallery',
  'url',
  'email',
  'phone',
  'date',
  'datetime',
  'time',
  'color',
  'link',
  'relationship',
  'oembed',
  'map',
  'group',
  'repeater',
  'flexible',
] as const

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

/** Legacy types from the original Field Groups, kept readable forever. */
export const LEGACY_FIELD_TYPES = ['text', 'textarea', 'number', 'checkbox', 'select', 'image', 'url', 'date', 'color'] as const

export type ChoiceOption = { label: string; value: string }

export const CONDITION_OPERATORS = ['equals', 'notEquals', 'isEmpty', 'notEmpty', 'contains', 'greater', 'less'] as const
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

/** Show this field only when `field` (a sibling's name) satisfies `operator` against `value`. */
export type ConditionRule = { field: string; operator: ConditionOperator; value?: string | null }

/** Outer array = OR of groups, each inner array = AND of rules. Empty = always shown. */
export type ConditionGroups = ConditionRule[][]

export type FlexibleLayout = { name: string; label: string; subFields: CustomFieldDef[] }

export type CustomFieldDef = {
  id?: string
  label: string
  name: string
  type: CustomFieldType
  required?: boolean | null
  helpText?: string | null
  defaultValue?: string | null
  /** select / radio / button-group choices. */
  options?: ChoiceOption[] | null
  /** select: store and accept several values. */
  multiple?: boolean | null
  /** number: value bounds and step. text-like: length bounds. repeater / gallery / relationship (hasMany): row or item count bounds. */
  min?: number | null
  max?: number | null
  step?: number | null
  /** Regex the text value must match, with the message shown when it does not. */
  pattern?: string | null
  patternMessage?: string | null
  /** checkbox: the label shown next to the box and used in merge tags when true. */
  trueLabel?: string | null
  /** relationship: collections that can be picked from. */
  relationTo?: string[] | null
  /** relationship: allow several documents. */
  hasMany?: boolean | null
  /** group / repeater: nested fixed sub-fields. */
  subFields?: CustomFieldDef[] | null
  /** flexible: the layouts a row can use, each with its own sub-fields. */
  layouts?: FlexibleLayout[] | null
  /** map: zoom used for the OpenStreetMap link. */
  defaultZoom?: number | null
  /** file / image: comma separated MIME prefixes allowed, eg "image/,application/pdf". Empty = any. */
  mimeTypes?: string | null
  /** Show this field only when these conditions hold. */
  conditions?: ConditionGroups | null
  width?: 'full' | 'half' | null
}

export const LOCATION_PARAMS = [
  'collection',
  'optionsPage',
  'pageTemplate',
  'pageParent',
  'postCategory',
  'postTag',
  'userRole',
  'status',
] as const
export type LocationParam = (typeof LOCATION_PARAMS)[number]

export type LocationRule = { param: LocationParam; operator: 'equals' | 'notEquals'; value: string }

/** Outer array = OR, inner = AND. `pageParent` / `pageTemplate` value "none" matches a page with no parent / template. */
export type LocationGroups = LocationRule[][]

/** One Field Group as the client and server use it after normalisation. */
export type FieldGroupDoc = {
  id: number
  name: string
  description?: string | null
  /** Legacy quick rule. Used only when `location` is empty. */
  targetCollections?: string[] | null
  /** Normalised definition (builder `definition`, or converted legacy `fields`). */
  fields: CustomFieldDef[]
  location: LocationGroups
}

/** Values live in one JSON column, keyed by CustomFieldDef.name. */
export type CustomFieldValues = Record<string, unknown>

/** Fetches the normalised groups that could apply to a collection (admin panel only). */
export async function fetchFieldGroups(collectionSlug: string): Promise<{ groups: FieldGroupDoc[]; userRoles: string[] }> {
  try {
    const res = await fetch(`/api/admin-field-groups?collection=${encodeURIComponent(collectionSlug)}`, { credentials: 'include' })
    if (!res.ok) return { groups: [], userRoles: [] }
    const json = (await res.json()) as { groups?: FieldGroupDoc[]; userRoles?: string[] }
    return { groups: json.groups || [], userRoles: json.userRoles || [] }
  } catch {
    return { groups: [], userRoles: [] }
  }
}
