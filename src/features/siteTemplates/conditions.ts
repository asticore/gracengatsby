import { TEMPLATE_AUDIENCES, TEMPLATE_LOCATION_PARAMS, type LocationGroups, type LocationRule } from '@/fields/customFields/types'

/** Params a template condition may use: the template ones plus the post ones that already exist. */
const ALLOWED_PARAMS = new Set<string>([...TEMPLATE_LOCATION_PARAMS, 'postCategory', 'postTag'])
const MAX_GROUPS = 10
const MAX_RULES = 10
const MAX_VALUE = 200
/** A `page` rule holds a comma separated list of page ids, so it can be longer. */
const MAX_PAGE_VALUE = 1000
const PAGE_IDS = /^\d+(,\d+)*$/

/** Parses a stored value that may be a JSON string or already-decoded data. Never throws. */
const decode = (input: unknown): unknown => {
  if (typeof input !== 'string') return input
  try {
    return JSON.parse(input) as unknown
  } catch {
    return null
  }
}

/**
 * How specific a condition set is: the most rules in any one group (an AND group of three rules beats one of
 * one). Empty conditions are 0, the fallback for their kind. Used to break ties between equal priorities.
 */
export function specificityOf(input: unknown): number {
  const { groups, valid } = sanitizeConditions(input)
  if (!valid) return 0
  // "Audience is everyone" restricts nothing, so it does not make a template more specific than one without it.
  const counted = (rule: LocationRule) => !(rule.param === 'audience' && rule.value === 'everyone' && rule.operator === 'equals')
  return groups.reduce((most, group) => Math.max(most, group.filter(counted).length), 0)
}

export type SanitizedConditions = {
  groups: LocationGroups
  /** False when anything was invalid, unknown or cut by the caps. An invalid template must never match. */
  valid: boolean
}

/**
 * Turns whatever is in the `conditions` JSON column into clean groups (OR of AND-rules).
 * Never throws and FAILS CLOSED: if anything is invalid (bad rule, unknown param or operator, too many
 * groups or rules, an empty group among others, junk JSON) `valid` is false so the resolver skips the
 * template instead of silently widening it. Empty conditions (null, [], [[]]) are valid and mean everywhere.
 * Max 10 groups x 10 rules, values max 200 characters.
 */
export function sanitizeConditions(input: unknown): SanitizedConditions {
  const raw = decode(input)
  if (raw === null || raw === undefined) return typeof input === 'string' && input.trim() !== '' && input.trim() !== 'null' ? { groups: [], valid: false } : { groups: [], valid: true }
  if (!Array.isArray(raw)) return { groups: [], valid: false }
  if (raw.every((group) => Array.isArray(group) && group.length === 0)) return { groups: [], valid: true }
  if (raw.length > MAX_GROUPS) return { groups: [], valid: false }
  const groups: LocationGroups = []
  for (const group of raw) {
    if (!Array.isArray(group) || group.length === 0 || group.length > MAX_RULES) return { groups: [], valid: false }
    const rules: LocationRule[] = []
    for (const rule of group) {
      if (!rule || typeof rule !== 'object') return { groups: [], valid: false }
      const { param, operator, value } = rule as Record<string, unknown>
      if (typeof param !== 'string' || !ALLOWED_PARAMS.has(param)) return { groups: [], valid: false }
      if (operator !== 'equals' && operator !== 'notEquals') return { groups: [], valid: false }
      if (typeof value !== 'string') return { groups: [], valid: false }
      if (param === 'audience' && !(TEMPLATE_AUDIENCES as readonly string[]).includes(value)) return { groups: [], valid: false }
      if (param === 'page') {
        if (value.length > MAX_PAGE_VALUE || !PAGE_IDS.test(value)) return { groups: [], valid: false }
      } else if (value.length > MAX_VALUE) return { groups: [], valid: false }
      rules.push({ param: param as LocationRule['param'], operator, value })
    }
    groups.push(rules)
  }
  return { groups, valid: true }
}