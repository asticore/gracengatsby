import type { ConditionGroups, ConditionRule, CustomFieldDef } from '@/fields/customFields/types'

/**
 * Conditional logic for fields. Pure and shared by the panel (live show/hide)
 * and the server (drops hidden values, skips their validation).
 */

export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'number') return Number.isNaN(value)
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every((v) => isEmptyValue(v))
  return false
}

function equalsValue(current: unknown, expected: string): boolean {
  if (Array.isArray(current)) return current.some((item) => String(item) === expected)
  if (typeof current === 'boolean') return String(current) === expected
  if (current === undefined || current === null) return false
  if (typeof current === 'object') return false
  return String(current) === expected
}

export function evaluateRule(rule: ConditionRule, values: Record<string, unknown>): boolean {
  const current = values[rule.field]
  const expected = rule.value ?? ''
  switch (rule.operator) {
    case 'equals':
      return equalsValue(current, expected)
    case 'notEquals':
      return !equalsValue(current, expected)
    case 'isEmpty':
      return isEmptyValue(current)
    case 'notEmpty':
      return !isEmptyValue(current)
    case 'contains':
      if (Array.isArray(current)) return current.some((item) => String(item).toLowerCase().includes(expected.toLowerCase()))
      return typeof current === 'string' && current.toLowerCase().includes(expected.toLowerCase())
    case 'greater':
    case 'less': {
      const a = Number(current)
      const b = Number(expected)
      if (current === undefined || current === null || current === '' || Number.isNaN(a) || Number.isNaN(b)) return false
      return rule.operator === 'greater' ? a > b : a < b
    }
    default:
      return false
  }
}

/** Empty / undefined groups mean "always shown". Otherwise: OR across groups, AND within a group. */
export function evaluateConditions(groups: ConditionGroups | null | undefined, values: Record<string, unknown>): boolean {
  if (!groups || groups.length === 0) return true
  return groups.some((rules) => rules.length > 0 && rules.every((rule) => evaluateRule(rule, values)))
}

export function isFieldVisible(def: CustomFieldDef, values: Record<string, unknown>): boolean {
  return evaluateConditions(def.conditions, values)
}

/**
 * Returns a copy of `values` with every hidden field removed, recursing into
 * group objects and repeater / flexible rows. Hidden fields are not saved.
 */
export function pruneHiddenValues(defs: CustomFieldDef[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values }
  for (const def of defs) {
    if (!(def.name in out)) continue
    if (!isFieldVisible(def, out)) {
      delete out[def.name]
      continue
    }
    out[def.name] = pruneNested(def, out[def.name])
  }
  return out
}

function pruneNested(def: CustomFieldDef, value: unknown): unknown {
  if ((def.type === 'group') && value && typeof value === 'object' && !Array.isArray(value)) {
    return pruneHiddenValues(def.subFields ?? [], value as Record<string, unknown>)
  }
  if (def.type === 'repeater' && Array.isArray(value)) {
    return value.map((row) => (row && typeof row === 'object' ? pruneHiddenValues(def.subFields ?? [], row as Record<string, unknown>) : row))
  }
  if (def.type === 'flexible' && Array.isArray(value)) {
    return value.map((row) => {
      if (!row || typeof row !== 'object') return row
      const layout = def.layouts?.find((l) => l.name === (row as Record<string, unknown>).layout)
      return layout ? pruneHiddenValues(layout.subFields, row as Record<string, unknown>) : row
    })
  }
  return value
}
