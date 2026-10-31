import type { LocationGroups, LocationRule } from '@/fields/customFields/types'
import { sanitizeConditions } from './conditions'

/** The condition kinds a site template accepts (must stay in sync with ALLOWED_PARAMS in ./conditions). */
export const CONDITION_KINDS = [
  { param: 'templateKind', label: 'Template type', hint: 'eg single-post' },
  { param: 'path', label: 'Page path', hint: 'eg /about' },
  { param: 'productCategory', label: 'Product category', hint: 'category name' },
  { param: 'productType', label: 'Product type', hint: 'eg simple' },
  { param: 'eventType', label: 'Event type', hint: 'eg paid' },
  { param: 'postCategory', label: 'Post category', hint: 'category name' },
  { param: 'postTag', label: 'Post tag', hint: 'tag name' },
  { param: 'domain', label: 'Domain', hint: 'eg shop.example.com' },
  { param: 'language', label: 'Language', hint: 'eg fr, or the default language code' },
] as const satisfies ReadonlyArray<{ param: LocationRule['param']; label: string; hint: string }>

const LABELS: Record<string, string> = Object.fromEntries(CONDITION_KINDS.map((k) => [k.param, k.label.toLowerCase()]))

const ruleText = (rule: LocationRule): string => `${LABELS[rule.param] ?? rule.param} ${rule.operator === 'notEquals' ? 'is not' : 'is'} "${rule.value}"`

/** Plain-language sentence for the "Where it applies" box. Invalid conditions say so (the resolver skips them). */
export function summariseConditions(input: unknown): string {
  const { groups, valid } = sanitizeConditions(input)
  if (!valid) return 'These conditions are not valid, so this template will not be used anywhere.'
  if (groups.length === 0) return 'Everywhere for its type.'
  const parts = groups.map((rules) => rules.map(ruleText).join(' and '))
  return `When ${parts.join(', or when ')}.`
}

/** Null when the conditions are valid, otherwise a message. */
export function validateConditions(input: unknown): string | null {
  return sanitizeConditions(input).valid ? null : 'Conditions are invalid: use known condition types, "is"/"is not", text values up to 200 characters, at most 10 groups of 10 rules, and no empty groups.'
}

/** Editor state -> the stored JSON shape: blank rows and empty groups are dropped. */
export function toStoredConditions(groups: LocationGroups): LocationGroups {
  return groups.map((g) => g.filter((r) => r.value.trim() !== '').map((r) => ({ param: r.param, operator: r.operator, value: r.value.trim() }))).filter((g) => g.length > 0)
}

/** Stored JSON -> editor groups, or null when the shape is not understood (caller falls back to raw JSON). */
export function fromStoredConditions(input: unknown): LocationGroups | null {
  const { groups, valid } = sanitizeConditions(input)
  return valid ? groups : null
}
