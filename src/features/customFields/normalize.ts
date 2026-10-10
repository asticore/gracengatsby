import {
  CONDITION_OPERATORS,
  CUSTOM_FIELD_TYPES,
  LOCATION_PARAMS,
  type ChoiceOption,
  type ConditionGroups,
  type CustomFieldDef,
  type CustomFieldType,
  type FieldGroupDoc,
  type FlexibleLayout,
  type LocationGroups,
  type LocationRule,
} from '@/fields/customFields/types'

/**
 * Pure normalisation of stored Field Group rows into the shapes the rest of the
 * feature uses. Safe on untrusted JSON: anything malformed is dropped or
 * coerced, never thrown.
 */

/** Nesting cap: top-level fields are depth 1, their sub-fields depth 2, and depth 3 is the deepest allowed. */
export const MAX_FIELD_DEPTH = 3

const TYPE_SET = new Set<string>(CUSTOM_FIELD_TYPES)
const OPERATOR_SET = new Set<string>(CONDITION_OPERATORS)
const PARAM_SET = new Set<string>(LOCATION_PARAMS)

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

/** Parses a value that may be a JSON string (legacy text columns) or already-decoded data. */
export function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function normalizeOptions(raw: unknown): ChoiceOption[] | null {
  const list = parseJsonish(raw)
  if (!Array.isArray(list)) return null
  const out: ChoiceOption[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const option = entry as Record<string, unknown>
    const value = str(option.value)
    if (value === null || value === '') continue
    out.push({ label: str(option.label) || value, value })
  }
  return out
}

function normalizeConditions(raw: unknown): ConditionGroups | null {
  const groups = parseJsonish(raw)
  if (!Array.isArray(groups)) return null
  const out: ConditionGroups = []
  for (const group of groups) {
    if (!Array.isArray(group)) continue
    const rules = group
      .map((rule) => {
        if (!rule || typeof rule !== 'object') return null
        const r = rule as Record<string, unknown>
        const field = str(r.field)
        const operator = str(r.operator)
        if (!field || !operator || !OPERATOR_SET.has(operator)) return null
        return { field, operator: operator as ConditionGroups[number][number]['operator'], value: str(r.value) }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
    if (rules.length) out.push(rules)
  }
  return out.length ? out : null
}

/**
 * Normalises a list of field definitions. `depth` is the depth of the list
 * itself: 1 for a group's top-level fields. Fields beyond MAX_FIELD_DEPTH keep
 * their own settings but lose any sub-fields.
 */
export function normalizeDefinition(raw: unknown, depth = 1): CustomFieldDef[] {
  const list = parseJsonish(raw)
  if (!Array.isArray(list)) return []

  const out: CustomFieldDef[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const f = entry as Record<string, unknown>
    const name = str(f.name)?.trim() ?? ''
    if (!name) continue
    const type = (str(f.type) && TYPE_SET.has(str(f.type)!) ? str(f.type) : 'text') as CustomFieldType

    const def: CustomFieldDef = {
      label: str(f.label)?.trim() || name,
      name,
      type,
      required: bool(f.required) ?? false,
      helpText: str(f.helpText),
      defaultValue: str(f.defaultValue),
      options: normalizeOptions(f.options),
      multiple: bool(f.multiple),
      min: num(f.min),
      max: num(f.max),
      step: num(f.step),
      pattern: str(f.pattern),
      patternMessage: str(f.patternMessage),
      trueLabel: str(f.trueLabel),
      relationTo: Array.isArray(f.relationTo) ? f.relationTo.filter((x): x is string => typeof x === 'string') : null,
      hasMany: bool(f.hasMany),
      defaultZoom: num(f.defaultZoom),
      mimeTypes: str(f.mimeTypes),
      conditions: normalizeConditions(f.conditions),
      width: f.width === 'half' || f.width === 'full' ? f.width : null,
    }
    if (def.id === undefined && str(f.id)) def.id = str(f.id)!

    if (depth < MAX_FIELD_DEPTH) {
      if (type === 'group' || type === 'repeater') {
        def.subFields = normalizeDefinition(f.subFields, depth + 1)
      }
      if (type === 'flexible') {
        const layouts = parseJsonish(f.layouts)
        def.layouts = Array.isArray(layouts)
          ? layouts
              .map((layout): FlexibleLayout | null => {
                if (!layout || typeof layout !== 'object') return null
                const l = layout as Record<string, unknown>
                const layoutName = str(l.name)?.trim()
                if (!layoutName) return null
                return {
                  name: layoutName,
                  label: str(l.label)?.trim() || layoutName,
                  subFields: normalizeDefinition(l.subFields, depth + 1),
                }
              })
              .filter((l): l is FlexibleLayout => l !== null)
          : []
      }
    } else {
      def.subFields = null
      def.layouts = null
    }

    // Duplicate names inside one list: the first wins; the builder warns about the rest.
    if (seen.has(name)) continue
    seen.add(name)
    out.push(def)
  }
  return out
}

/** Finds names that appear more than once in one list (used by the builder to warn). */
export function findDuplicateNames(defs: CustomFieldDef[]): string[] {
  const counts = new Map<string, number>()
  for (const def of defs) if (def.name) counts.set(def.name, (counts.get(def.name) ?? 0) + 1)
  return [...counts].filter(([, n]) => n > 1).map(([name]) => name)
}

/**
 * Converts the legacy nested `fields` rows (eg_field_groups_fields) into the
 * definition shape. Legacy rows have no conditions, sub-fields or validation.
 */
export function legacyFieldsToDefinition(raw: unknown): CustomFieldDef[] {
  const list = parseJsonish(raw)
  if (!Array.isArray(list)) return []
  return normalizeDefinition(
    list
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      .map((row) => ({
        label: row.label,
        name: row.name,
        type: row.type,
        required: row.required,
        helpText: row.helpText,
        defaultValue: row.defaultValue,
        options: Array.isArray(row.options) ? row.options.map((o: Record<string, unknown>) => ({ label: o.label, value: o.value })) : null,
      })),
  )
}

/** The effective definition: builder `definition` when it has fields, otherwise the legacy rows. */
export function effectiveDefinition(raw: { definition?: unknown; fields?: unknown }): CustomFieldDef[] {
  const fromDefinition = normalizeDefinition(raw.definition)
  if (fromDefinition.length > 0) return fromDefinition
  return legacyFieldsToDefinition(raw.fields)
}

/**
 * Normalises location groups. A group is an AND of rules, so one invalid rule makes the whole
 * group unusable: the group is dropped, not just the rule. Groups left empty are dropped too.
 */
export function normalizeLocation(raw: unknown): LocationGroups {
  const groups = parseJsonish(raw)
  if (!Array.isArray(groups)) return []
  const out: LocationGroups = []
  for (const group of groups) {
    if (!Array.isArray(group)) continue
    const rules: LocationRule[] = []
    let valid = true
    for (const rule of group) {
      const r = rule && typeof rule === 'object' ? (rule as Record<string, unknown>) : null
      const param = r ? str(r.param) : null
      const value = r ? (str(r.value) ?? (num(r.value) !== null ? String(r.value) : null)) : null
      if (!r || !param || !PARAM_SET.has(param) || value === null || value === '') {
        valid = false
        break
      }
      rules.push({ param: param as LocationRule['param'], operator: r.operator === 'notEquals' ? 'notEquals' : 'equals', value })
    }
    if (valid && rules.length) out.push(rules)
  }
  return out
}

/**
 * The location a group applies to. An explicit `location` always wins. Only a
 * group with no location rules falls back to its legacy `targetCollections`.
 */
export function effectiveLocation(raw: { location?: unknown; targetCollections?: unknown }): LocationGroups {
  const explicit = normalizeLocation(raw.location)
  if (explicit.length > 0) return explicit
  const targets = parseJsonish(raw.targetCollections)
  if (!Array.isArray(targets)) return []
  return targets
    .filter((t): t is string => typeof t === 'string' && t !== '')
    .map((collection) => [{ param: 'collection' as const, operator: 'equals' as const, value: collection }])
}

/** Full normalisation of one raw field-groups row (as returned by the engine, or a legacy JSON string). */
export function normalizeFieldGroup(raw: Record<string, unknown>): FieldGroupDoc {
  const targets = parseJsonish(raw.targetCollections)
  return {
    id: Number(raw.id),
    name: str(raw.name) ?? '',
    description: str(raw.description),
    targetCollections: Array.isArray(targets) ? targets.filter((t): t is string => typeof t === 'string') : null,
    fields: effectiveDefinition(raw as { definition?: unknown; fields?: unknown }),
    location: effectiveLocation(raw as { location?: unknown; targetCollections?: unknown }),
  }
}

/**
 * The starting value a field gets on a NEW document (its `defaultValue` string
 * coerced to the field's type). undefined when there is no usable default.
 */
export function defaultValueFor(def: CustomFieldDef): unknown {
  const raw = def.defaultValue
  if (raw === null || raw === undefined || raw === '') return undefined
  switch (def.type) {
    case 'number': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    }
    case 'checkbox':
      return raw === 'true' ? true : raw === 'false' ? false : undefined
    case 'select':
      return def.multiple ? [raw] : raw
    case 'gallery':
    case 'repeater':
    case 'flexible':
    case 'group':
    case 'link':
    case 'map':
      return undefined
    default:
      return raw
  }
}

/**
 * The definition list as stored, for the builder to EDIT. Unlike
 * normalizeDefinition this keeps rows that are still being typed (an empty name,
 * a blank rule) so they do not vanish mid-edit. The server normalises on save.
 */
export function rawDefinitionList(value: unknown): CustomFieldDef[] {
  const list = parseJsonish(value)
  if (!Array.isArray(list)) return []
  return list
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({ ...(row as unknown as CustomFieldDef), name: str(row.name) ?? '', label: str(row.label) ?? '', type: (str(row.type) ?? 'text') as CustomFieldType }))
}

/** Location groups as stored, keeping blank rules so the editor can show them. */
export function rawLocationGroups(value: unknown): LocationGroups {
  const groups = parseJsonish(value)
  if (!Array.isArray(groups)) return []
  return groups
    .filter((group): group is unknown[] => Array.isArray(group))
    .map((group) =>
      group
        .filter((rule): rule is Record<string, unknown> => Boolean(rule) && typeof rule === 'object')
        .map((rule) => ({
          param: (str(rule.param) ?? 'collection') as LocationRule['param'],
          operator: rule.operator === 'notEquals' ? ('notEquals' as const) : ('equals' as const),
          value: str(rule.value) ?? (num(rule.value) !== null ? String(rule.value) : ''),
        })),
    )
}
