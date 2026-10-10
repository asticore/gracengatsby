import type { CustomFieldDef } from '@/fields/customFields/types'

/**
 * Turns stored custom field values into the plain strings merge tags print.
 * Pure. Media ids are resolved to URLs through a map the caller prefetched
 * (see collectMediaIds), so nothing here touches the database.
 */

export type MediaUrls = Map<number, string>

export type StringifyOptions = { mediaUrls?: MediaUrls }

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function mediaUrl(value: unknown, opts: StringifyOptions): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return opts.mediaUrls?.get(value) ?? ''
  if (isObject(value) && typeof value.url === 'string') return value.url
  return ''
}

/** Stringifies a primitive or a list of primitives. Objects give nothing - address their fields with a dotted tag instead. */
function joinPrimitives(items: unknown[], each: (item: unknown) => string): string {
  return items
    .map((item) => each(item))
    .filter((s) => s !== '')
    .join(', ')
}

/** Stringifies a value using its definition. */
export function stringifyFieldValue(def: CustomFieldDef | undefined, value: unknown, opts: StringifyOptions = {}): string {
  if (value === undefined || value === null || value === '') return ''
  if (!def) return stringifyGuess(value, opts)

  switch (def.type) {
    case 'checkbox':
      if (value === true) return def.trueLabel || 'Yes'
      if (value === false) return 'No'
      return ''

    case 'number':
      return typeof value === 'number' ? String(value) : ''

    case 'select':
    case 'radio':
    case 'button-group': {
      const labelFor = (v: unknown) => {
        const match = (def.options ?? []).find((o) => o.value === v)
        return match ? match.label : typeof v === 'string' ? v : ''
      }
      if (Array.isArray(value)) return joinPrimitives(value, labelFor)
      return labelFor(value)
    }

    case 'image':
    case 'file':
      return mediaUrl(value, opts)

    case 'gallery':
      return Array.isArray(value) ? joinPrimitives(value, (v) => mediaUrl(v, opts)) : ''

    case 'relationship': {
      const titleOf = (v: unknown) => {
        if (isObject(v)) return String(v.title ?? v.name ?? v.question ?? v.id ?? '')
        return typeof v === 'number' || typeof v === 'string' ? String(v) : ''
      }
      if (Array.isArray(value)) return joinPrimitives(value, titleOf)
      return titleOf(value)
    }

    case 'link':
      return isObject(value) && typeof value.url === 'string' ? value.url : ''

    case 'map':
      if (!isObject(value)) return ''
      if (typeof value.address === 'string' && value.address) return value.address
      return typeof value.lat === 'number' && typeof value.lng === 'number' ? `${value.lat},${value.lng}` : ''

    case 'group':
    case 'repeater':
    case 'flexible':
      return Array.isArray(value) ? joinPrimitives(value, (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')) : ''

    case 'text':
    case 'textarea':
    case 'wysiwyg':
    case 'url':
    case 'email':
    case 'phone':
    case 'color':
    case 'date':
    case 'datetime':
    case 'time':
    case 'oembed':
      return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

    default:
      return stringifyGuess(value, opts)
  }
}

/** Best-effort stringify when no definition is known (values from a legacy group or an unknown field). */
export function stringifyGuess(value: unknown, opts: StringifyOptions = {}): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return joinPrimitives(value, (v) => (typeof v === 'object' ? '' : stringifyGuess(v, opts)))
  if (isObject(value)) {
    if (typeof value.url === 'string') return value.url
    if (typeof value.title === 'string') return value.title
    return ''
  }
  return ''
}

/** Adds one value (and, recursively, its nested values) to the flat tag map. */
function emit(out: Record<string, string>, key: string, def: CustomFieldDef | undefined, value: unknown, opts: StringifyOptions): void {
  out[key] = stringifyFieldValue(def, value, opts)
  if (!def) return

  switch (def.type) {
    case 'group':
      if (isObject(value)) {
        for (const sub of def.subFields ?? []) emit(out, `${key}.${sub.name}`, sub, value[sub.name], opts)
      }
      break

    case 'repeater':
      if (Array.isArray(value)) {
        value.forEach((row, i) => {
          if (!isObject(row)) return
          for (const sub of def.subFields ?? []) emit(out, `${key}.${i}.${sub.name}`, sub, row[sub.name], opts)
        })
      }
      break

    case 'flexible':
      if (Array.isArray(value)) {
        value.forEach((row, i) => {
          if (!isObject(row)) return
          out[`${key}.${i}.layout`] = typeof row.layout === 'string' ? row.layout : ''
          const layout = def.layouts?.find((l) => l.name === row.layout)
          for (const sub of layout?.subFields ?? []) emit(out, `${key}.${i}.${sub.name}`, sub, row[sub.name], opts)
        })
      }
      break

    case 'gallery':
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          out[`${key}.${i}`] = mediaUrl(item, opts)
        })
      }
      break

    case 'link':
      if (isObject(value)) {
        out[`${key}.url`] = typeof value.url === 'string' ? value.url : ''
        out[`${key}.title`] = typeof value.title === 'string' ? value.title : ''
        out[`${key}.target`] = typeof value.target === 'string' ? value.target : ''
      }
      break

    case 'map':
      if (isObject(value)) {
        out[`${key}.address`] = typeof value.address === 'string' ? value.address : ''
        out[`${key}.lat`] = typeof value.lat === 'number' ? String(value.lat) : ''
        out[`${key}.lng`] = typeof value.lng === 'number' ? String(value.lng) : ''
        out[`${key}.zoom`] = typeof value.zoom === 'number' ? String(value.zoom) : ''
      }
      break

    default:
      break
  }
}

/**
 * Builds the `field:<name>` tag map for one document. Every defined field gets
 * a key even when empty, so an empty field resolves to '' and never leaks a
 * literal tag onto the page.
 */
export function buildCustomFieldContext(
  defs: CustomFieldDef[],
  values: Record<string, unknown> | null | undefined,
  opts: StringifyOptions = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  const data = isObject(values) ? values : {}
  for (const def of defs) emit(out, `field:${def.name}`, def, data[def.name], opts)
  return out
}

/** Tag map for values with no definitions to hand (fallback for loops over legacy data). */
export function buildGuessedCustomContext(values: Record<string, unknown> | null | undefined, opts: StringifyOptions = {}): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isObject(values)) return out
  for (const [name, value] of Object.entries(values)) out[`field:${name}`] = stringifyGuess(value, opts)
  return out
}

/** Every media id the given values reference, so the caller can fetch their URLs in one query. */
export function collectMediaIds(defs: CustomFieldDef[], values: Record<string, unknown> | null | undefined): number[] {
  const ids = new Set<number>()
  const visit = (defList: CustomFieldDef[], data: unknown) => {
    if (!isObject(data)) return
    for (const def of defList) {
      const value = data[def.name]
      if (def.type === 'image' || def.type === 'file') {
        if (typeof value === 'number') ids.add(value)
      } else if (def.type === 'gallery' && Array.isArray(value)) {
        for (const item of value) if (typeof item === 'number') ids.add(item)
      } else if (def.type === 'group') {
        visit(def.subFields ?? [], value)
      } else if (def.type === 'repeater' && Array.isArray(value)) {
        for (const row of value) visit(def.subFields ?? [], row)
      } else if (def.type === 'flexible' && Array.isArray(value)) {
        for (const row of value) {
          if (!isObject(row)) continue
          visit(def.layouts?.find((l) => l.name === row.layout)?.subFields ?? [], row)
        }
      }
    }
  }
  visit(defs, values)
  return [...ids]
}
