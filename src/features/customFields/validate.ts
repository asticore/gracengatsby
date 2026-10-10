import { isEmptyValue, isFieldVisible } from './conditions'
import { defaultValueFor } from './normalize'
import { matchesLocation, type LocationContext } from './location'
import type { CustomFieldDef, FieldGroupDoc } from '@/fields/customFields/types'
import { safeUrl } from '@/lib/mergeTags'

/**
 * Validation for custom field values. Pure: the server hook and the panel's
 * inline errors both call it. Hidden fields (failed conditions) are skipped
 * entirely, so they are never required.
 */

/** `path` is the human label chain shown to editors, eg "Speakers › Name". `field` is the top-level field name the error belongs to. */
export type FieldProblem = { path: string; message: string; field: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[0-9 ()\-.]{6,}$/
const HEX = /^#[0-9a-fA-F]{6}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Providers the oembed field will embed. Anything else is rejected, so the field never frames arbitrary sites. */
export const OEMBED_ALLOWED_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'open.spotify.com', 'soundcloud.com'] as const

export function isAllowedOembedUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    return OEMBED_ALLOWED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isId = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isInteger(value) && value > 0) || (typeof value === 'string' && /^\d+$/.test(value))

function checkBounds(value: number, def: CustomFieldDef, path: string, problems: FieldProblem[], top: string): void {
  if (def.min !== null && def.min !== undefined && value < def.min) {
    problems.push({ path, field: top, message: `must be at least ${def.min}` })
  }
  if (def.max !== null && def.max !== undefined && value > def.max) {
    problems.push({ path, field: top, message: `must be at most ${def.max}` })
  }
}

function checkCount(count: number, def: CustomFieldDef, noun: string, path: string, problems: FieldProblem[], top: string): void {
  if (def.min !== null && def.min !== undefined && count < def.min) {
    problems.push({ path, field: top, message: `needs at least ${def.min} ${noun}` })
  }
  if (def.max !== null && def.max !== undefined && count > def.max) {
    problems.push({ path, field: top, message: `allows at most ${def.max} ${noun}` })
  }
}

/** Validates one value against its definition, appending problems. */
const countNoun = (def: CustomFieldDef): string => {
  if (def.type === 'gallery') return 'items'
  if (def.type === 'relationship') return 'documents'
  return 'rows'
}

const isCountable = (def: CustomFieldDef): boolean =>
  def.type === 'repeater' || def.type === 'flexible' || def.type === 'gallery' || (def.type === 'relationship' && Boolean(def.hasMany))

export function validateValue(def: CustomFieldDef, value: unknown, path: string, top: string, problems: FieldProblem[]): void {
  // A group is validated by its own sub-fields even when they are all empty.
  if (def.type === 'group' && isObject(value)) {
    validateObject(def.subFields ?? [], value, path, top, problems)
    return
  }

  const isCheckbox = def.type === 'checkbox'
  const empty = isCheckbox ? false : isEmptyValue(value)

  if (def.required && (isCheckbox ? value !== true : empty)) {
    problems.push({ path, field: top, message: 'is required' })
    return
  }
  if (empty) {
    // An explicit minimum applies even when nothing has been added yet.
    if (isCountable(def) && def.min) checkCount(0, def, countNoun(def), path, problems, top)
    return
  }

  const fail = (message: string): void => {
    problems.push({ path, field: top, message })
  }

  switch (def.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('must be a number')
      checkBounds(value, def, path, problems, top)
      if (def.step && def.step > 0) {
        const base = def.min ?? 0
        const steps = (value - base) / def.step
        if (Math.abs(steps - Math.round(steps)) > 1e-9) fail(`must be a multiple of ${def.step}`)
      }
      return
    }

    case 'checkbox':
      if (typeof value !== 'boolean') fail('must be true or false')
      return

    case 'text':
    case 'textarea':
    case 'wysiwyg':
    case 'url':
    case 'email':
    case 'phone':
    case 'color':
    case 'date':
    case 'datetime':
    case 'time': {
      if (typeof value !== 'string') return fail('must be text')
      const trimmed = value.trim()
      if (def.type === 'text' || def.type === 'textarea' || def.type === 'wysiwyg') {
        if (def.min !== null && def.min !== undefined && value.length < def.min) fail(`must be at least ${def.min} characters`)
        if (def.max !== null && def.max !== undefined && value.length > def.max) fail(`must be at most ${def.max} characters`)
      }
      if (def.pattern) {
        try {
          if (!new RegExp(def.pattern).test(value)) fail(def.patternMessage || 'does not match the required format')
        } catch {
          // A broken pattern in the builder must not block saving content.
        }
      }
      if (def.type === 'url' && safeUrl(trimmed) === null) fail('must be a valid link: http, https, mailto or tel, or a path starting with /')
      if (def.type === 'email' && !EMAIL.test(trimmed)) fail('must be a valid email address')
      if (def.type === 'phone' && !PHONE.test(trimmed)) fail('must be a valid phone number')
      if (def.type === 'color' && !HEX.test(value)) fail('must be a hex colour like #1a2b3c')
      if (def.type === 'date' && (!DATE.test(value) || Number.isNaN(Date.parse(value)))) fail('must be a valid date')
      if (def.type === 'datetime' && Number.isNaN(Date.parse(value))) fail('must be a valid date and time')
      if (def.type === 'time' && !TIME.test(value)) fail('must be a time like 14:30')
      return
    }

    case 'select': {
      const allowed = (def.options ?? []).map((o) => o.value)
      const values = def.multiple ? value : [value]
      if (!Array.isArray(values)) return fail('must be a list of choices')
      if (allowed.length === 0) return
      if (values.some((v) => typeof v !== 'string' || !allowed.includes(v))) fail('has a value that is not one of the choices')
      return
    }

    case 'radio':
    case 'button-group': {
      const allowed = (def.options ?? []).map((o) => o.value)
      if (typeof value !== 'string' || (allowed.length > 0 && !allowed.includes(value))) fail('is not one of the choices')
      return
    }

    case 'image':
    case 'file':
      if (!isId(value) && !(typeof value === 'string' && isHttpUrl(value))) fail('must be a media item')
      return

    case 'gallery': {
      if (!Array.isArray(value) || value.some((v) => !isId(v))) return fail('must be a list of media items')
      checkCount(value.length, def, countNoun(def), path, problems, top)
      return
    }

    case 'relationship': {
      if (def.hasMany) {
        if (!Array.isArray(value) || value.some((v) => !isId(v))) return fail('must be a list of documents')
        checkCount(value.length, def, countNoun(def), path, problems, top)
      } else if (!isId(value)) {
        fail('must be a document')
      }
      return
    }

    case 'link': {
      if (typeof value !== 'object' || Array.isArray(value)) return fail('must be a link')
      const link = value as { url?: unknown; target?: unknown }
      if (typeof link.url !== 'string' || safeUrl(link.url) === null) {
        if (def.required || (typeof link.url === 'string' && link.url !== '')) fail('needs a valid link: http, https, mailto or tel, or a path starting with /')
      }
      if (link.target !== undefined && link.target !== '' && link.target !== '_self' && link.target !== '_blank') {
        fail('has an unknown target')
      }
      return
    }

    case 'oembed':
      if (!isAllowedOembedUrl(value)) fail(`must be an https link to ${OEMBED_ALLOWED_HOSTS.join(', ')}`)
      return

    case 'map': {
      if (typeof value !== 'object' || Array.isArray(value)) return fail('must be a location')
      const map = value as { lat?: unknown; lng?: unknown }
      if (map.lat !== undefined && map.lat !== null && map.lat !== '' && (typeof map.lat !== 'number' || map.lat < -90 || map.lat > 90)) {
        fail('latitude must be between -90 and 90')
      }
      if (map.lng !== undefined && map.lng !== null && map.lng !== '' && (typeof map.lng !== 'number' || map.lng < -180 || map.lng > 180)) {
        fail('longitude must be between -180 and 180')
      }
      return
    }

    case 'group': {
      if (typeof value !== 'object' || Array.isArray(value)) return fail('must be a group')
      validateObject(def.subFields ?? [], value as Record<string, unknown>, path, top, problems)
      return
    }

    case 'repeater': {
      if (!Array.isArray(value)) return fail('must be a list of rows')
      checkCount(value.length, def, countNoun(def), path, problems, top)
      value.forEach((row, index) => {
        const rowPath = `${path} › Row ${index + 1}`
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          problems.push({ path: rowPath, field: top, message: 'must be a row of values' })
          return
        }
        validateObject(def.subFields ?? [], row as Record<string, unknown>, rowPath, top, problems)
      })
      return
    }

    case 'flexible': {
      if (!Array.isArray(value)) return fail('must be a list of rows')
      checkCount(value.length, def, countNoun(def), path, problems, top)
      value.forEach((row, index) => {
        const rowPath = `${path} › Row ${index + 1}`
        const layoutName = row && typeof row === 'object' ? (row as Record<string, unknown>).layout : undefined
        const layout = def.layouts?.find((l) => l.name === layoutName)
        if (!layout) {
          problems.push({ path: rowPath, field: top, message: 'uses a layout that does not exist' })
          return
        }
        validateObject(layout.subFields, row as Record<string, unknown>, rowPath, top, problems)
      })
      return
    }

    default:
      return
  }
}

/** Validates every visible field in `defs` against `values`. */
export function validateObject(
  defs: CustomFieldDef[],
  values: Record<string, unknown>,
  pathPrefix: string,
  top: string,
  problems: FieldProblem[],
): void {
  for (const def of defs) {
    if (!isFieldVisible(def, values)) continue
    const label = def.label || def.name
    const path = pathPrefix ? `${pathPrefix} › ${label}` : label
    validateValue(def, values[def.name], path, top || def.name, problems)
  }
}

/** Validates a flat values object (the `customFields` JSON) against a list of definitions. */
export function validateFieldValues(defs: CustomFieldDef[], values: Record<string, unknown>): FieldProblem[] {
  const problems: FieldProblem[] = []
  validateObject(defs, values, '', '', problems)
  return problems
}

/** The definitions that apply to one document: groups whose location matches `ctx`, de-duplicated by name (first group wins). */
export function definitionsFor(groups: FieldGroupDoc[], ctx: LocationContext): CustomFieldDef[] {
  const seen = new Set<string>()
  const out: CustomFieldDef[] = []
  for (const group of groups) {
    if (!matchesLocation(group.location, ctx)) continue
    for (const def of group.fields) {
      if (seen.has(def.name)) continue
      seen.add(def.name)
      out.push(def)
    }
  }
  return out
}

/**
 * Every key a definition list defines, at any depth (group and repeater sub-fields, flexible layout
 * fields). Values for any other key are not part of the group and are dropped before saving.
 */
export function definedValueKeys(defs: CustomFieldDef[]): Set<string> {
  const names = new Set<string>()
  const visit = (list: CustomFieldDef[] | null | undefined): void => {
    for (const def of list ?? []) {
      if (def.name) names.add(def.name)
      visit(def.subFields)
      for (const layout of def.layouts ?? []) visit(layout.subFields)
    }
  }
  visit(defs)
  return names
}

/** Fills in defaults for fields the values do not set yet. Used only when a document is created. */
export function applyDefaults(defs: CustomFieldDef[], values: Record<string, unknown>): Record<string, unknown> {
  const out = { ...values }
  for (const def of defs) {
    if (out[def.name] !== undefined) continue
    const fallback = defaultValueFor(def)
    if (fallback !== undefined) out[def.name] = fallback
  }
  return out
}
