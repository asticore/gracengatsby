import { readFlatDesign } from './upgrade'
import { upgradeV1 } from './upgradeV1'

/**
 * Conversion of stored design values to the unified grouped model, used by the
 * design migration (src/migrations/20270126_100000_design_grouped.ts).
 *
 * Only v1 flat values (no schemaVersion, or 1) that carry at least one grouped
 * key are converted. Anything else is left exactly as stored:
 *   - schemaVersion 2 (already grouped, or typed Rs fields with no groups). The
 *     typed values have no v1 equivalent, so they are never rewritten.
 *   - flat values with no grouped key (empty, or unknown keys only). These stay
 *     flat, the same rule as toStoredDesign, because a grouped value with no
 *     groups would read back as empty.
 *   - any value whose flat read-back differs from the original after conversion.
 *     This never happens today (upgradeV1 is lossless); it is a guard so the
 *     migration cannot change what a block renders.
 *
 * Idempotent: a converted value has schemaVersion 2 and groups, so a second pass
 * finds nothing to change.
 */

export type JsonObject = Record<string, unknown>

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** JSON with sorted keys and no undefined, so two values compare equal whatever their key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Returns the grouped value for a stored v1 flat design, or null when it must stay as it is. */
export function groupStoredV1Design(stored: JsonObject): JsonObject | null {
  if (stored.schemaVersion !== undefined && stored.schemaVersion !== 1) return null
  const grouped = upgradeV1(stored) as unknown as JsonObject
  if (grouped.groups === undefined) return null
  if (canonicalJson(readFlatDesign(grouped)) !== canonicalJson(readFlatDesign(stored))) return null
  return grouped
}

export type ConvertCount = { converted: number }

/** A `design` column value: one design object. Returns the value to store, unchanged when nothing converts. */
export function convertDesignColumn(parsed: unknown, count: ConvertCount): unknown {
  if (!isPlainObject(parsed)) return parsed
  const grouped = groupStoredV1Design(parsed)
  if (!grouped) return parsed
  count.converted += 1
  return grouped
}

/**
 * A JSON tree that holds nested blocks and columns (section `columns`, form `layout`).
 * Every `design` key in it is converted. `props` is never entered: element props are
 * block data, not design.
 */
export function convertDesignsInTree(node: unknown, count: ConvertCount): unknown {
  if (Array.isArray(node)) return node.map((item) => convertDesignsInTree(item, count))
  if (!isPlainObject(node)) return node
  const out: JsonObject = {}
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (key === 'props') out[key] = value
    else if (key === 'design' && isPlainObject(value)) out[key] = convertDesignColumn(value, count)
    else out[key] = convertDesignsInTree(value, count)
  }
  return out
}
