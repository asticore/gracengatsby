import type { ConditionRule, ConditionalLogic, FormFieldDef, SubmissionValues } from './types'

import { PRESENTATIONAL_TYPES } from './types'
import { evaluateNode, parseFormula, roundTo, toNumber } from './expression'

/**
 * Which fields are actually in play, given what has been filled in so far.
 *
 * This module is imported by both the browser renderer and the submission
 * handler, and that is the whole point: a field hidden by conditional logic
 * must be hidden on the server too, or anyone can post a value for it straight
 * to the API and bypass the rule. The renderer decides what to draw and the
 * handler decides what to keep, from the same function over the same data.
 *
 * Pure, synchronous, no imports beyond types - so it runs identically in a
 * Worker and in a browser, and can be tested without either.
 */

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(asText).join(',')
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

const isBlank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'boolean') return value === false
  return String(value).trim() === ''
}

/**
 * One rule against one value.
 *
 * Comparison is case-insensitive and string-based except for the two numeric
 * operators, because the value being compared against is typed into a text box
 * in the admin area and "Yes" not matching "yes" is never what the author meant.
 */
export function evaluateRule(rule: ConditionRule, values: SubmissionValues): boolean {
  if (!rule?.field) return false

  const actual = values[rule.field]
  const operator = rule.operator || 'equals'

  if (operator === 'isEmpty') return isBlank(actual)
  if (operator === 'isNotEmpty') return !isBlank(actual)

  const expected = asText(rule.value).trim().toLowerCase()

  if (operator === 'greaterThan') return toNumber(actual) > toNumber(rule.value)
  if (operator === 'lessThan') return toNumber(actual) < toNumber(rule.value)

  // A multi-select or checkbox group holds several values; `equals` on one of
  // them means "is among them", which is what an author picking a single option
  // from a dropdown of choices expects.
  if (Array.isArray(actual)) {
    const members = actual.map((entry) => asText(entry).trim().toLowerCase())
    switch (operator) {
      case 'equals':
        return members.includes(expected)
      case 'notEquals':
        return !members.includes(expected)
      case 'contains':
        return members.some((member) => member.includes(expected))
      case 'notContains':
        return !members.some((member) => member.includes(expected))
      default:
        return false
    }
  }

  const text = asText(actual).trim().toLowerCase()

  switch (operator) {
    case 'equals':
      return text === expected
    case 'notEquals':
      return text !== expected
    case 'contains':
      return text.includes(expected)
    case 'notContains':
      return !text.includes(expected)
    default:
      return false
  }
}

/** True when a field's own logic says it should be on screen. */
export function isFieldVisible(field: FormFieldDef, values: SubmissionValues): boolean {
  const logic: ConditionalLogic = field?.conditional
  if (!logic?.enabled) return true

  const rules = (logic.rules || []).filter((rule) => Boolean(rule?.field))
  // Logic switched on but with no usable rules is an unfinished edit, not an
  // instruction to hide the field from everyone.
  if (rules.length === 0) return true

  const matched =
    logic.match === 'any'
      ? rules.some((rule) => evaluateRule(rule, values))
      : rules.every((rule) => evaluateRule(rule, values))

  return logic.action === 'hide' ? !matched : matched
}

/**
 * Every visible field, resolved together.
 *
 * Run repeatedly because one field's visibility can depend on another field
 * that is itself conditional: hiding A must be able to hide B that depends on
 * A's value. Each pass clears the values of newly hidden fields and re-checks,
 * settling within a few rounds for any sane form. The cap stops a formula that
 * references itself in a cycle from spinning - it is a content mistake, and
 * stopping at the last stable answer is better than hanging the request.
 */
export function resolveVisibility(fields: FormFieldDef[], values: SubmissionValues): Set<string> {
  const all = (fields || []).filter((field) => Boolean(field))
  let effective: SubmissionValues = { ...values }
  let visible = new Set<string>()

  for (let pass = 0; pass < 10; pass += 1) {
    const next = new Set<string>()
    for (const field of all) {
      if (isFieldVisible(field, effective)) {
        if (field.name) next.add(field.name)
      }
    }

    const sameAsLast = next.size === visible.size && [...next].every((name) => visible.has(name))
    visible = next
    if (sameAsLast && pass > 0) break

    effective = {}
    for (const [key, value] of Object.entries(values)) {
      if (visible.has(key)) effective[key] = value
    }
  }

  return visible
}

/**
 * Recomputes every calculation field from the values around it.
 *
 * Calculations are resolved in dependency order by repeated passes rather than
 * a topological sort: a calculation may reference another calculation, and the
 * number of them on one form is small enough that iterating is cheaper to read
 * and impossible to get subtly wrong. A cycle simply stops changing.
 *
 * Hidden calculations resolve to 0 so a total cannot include a line the visitor
 * was never shown.
 */
export function applyCalculations(
  fields: FormFieldDef[],
  values: SubmissionValues,
  visible?: Set<string>,
): SubmissionValues {
  const calculations = (fields || []).filter(
    (field) => field?.type === 'calculation' && field.name && field.calculation?.formula,
  )
  if (calculations.length === 0) return { ...values }

  const parsed = calculations.map((field) => ({
    field,
    result: parseFormula(field.calculation.formula),
  }))

  const result: SubmissionValues = { ...values }

  for (let pass = 0; pass < calculations.length + 1; pass += 1) {
    let changed = false

    for (const entry of parsed) {
      const name = entry.field.name
      if (visible && !visible.has(name)) {
        if (result[name] !== 0) {
          result[name] = 0
          changed = true
        }
        continue
      }

      const value = entry.result.ok
        ? roundTo(evaluateNode(entry.result.node, result), entry.field.calculation.decimalPlaces ?? 2)
        : 0

      if (result[name] !== value) {
        result[name] = value
        changed = true
      }
    }

    if (!changed) break
  }

  return result
}

/**
 * The values a submission is allowed to carry: calculations recomputed from
 * scratch and anything hidden dropped.
 *
 * Calculations are always recomputed rather than trusted, for the same reason
 * hidden fields are dropped - the browser sent them, so on a purchasable form
 * they are a price the visitor could have chosen for themselves.
 */
export function sanitiseValues(
  fields: FormFieldDef[],
  submitted: SubmissionValues,
): { values: SubmissionValues; visible: Set<string> } {
  const inputs: SubmissionValues = {}
  for (const field of fields || []) {
    if (!field?.name) continue
    if (field.type === 'calculation') continue
    if (PRESENTATIONAL_TYPES.includes(field.type)) continue
    if (Object.prototype.hasOwnProperty.call(submitted, field.name)) {
      inputs[field.name] = submitted[field.name]
    }
  }

  // Visibility is decided before calculations so a calculation can be hidden by
  // a rule, then computed as 0 in the pass below.
  const withCalculations = applyCalculations(fields, inputs)
  const visible = resolveVisibility(fields, withCalculations)

  const kept: SubmissionValues = {}
  for (const [key, value] of Object.entries(inputs)) {
    if (visible.has(key)) kept[key] = value
  }

  return { values: applyCalculations(fields, kept, visible), visible }
}

/**
 * Groups fields into pages at each page-break field.
 *
 * The break itself is not part of either page - it is a marker, not content -
 * so a form with no breaks comes back as one page and renders unchanged.
 */
export function splitIntoPages(fields: FormFieldDef[]): FormFieldDef[][] {
  const pages: FormFieldDef[][] = [[]]
  for (const field of fields || []) {
    if (field?.type === 'page') {
      pages.push([])
      continue
    }
    pages[pages.length - 1].push(field)
  }
  return pages.filter((page, index) => page.length > 0 || index === 0)
}
