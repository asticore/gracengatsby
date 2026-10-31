import { V1_GROUP_OF, type V1Group } from './v1Groups'
import type { DesignV2 } from './types'

/**
 * Converts a v1 flat design (BlockStyle in src/lib/blockStyle.ts) to the unified
 * design model.
 *
 * Lossless by construction: every v1 key is copied verbatim (as JSON, so no
 * reference is shared with the stored value) into `groups[group][key]`, where
 * the group comes from V1_GROUP_OF. Keys outside that table go to `legacy`.
 * downgradeV1 reverses this exactly, so a v1 design rendered through
 * downgradeV1(upgradeV1(d)) produces the same output as d.
 */

const cloneJson = (value: unknown): unknown => {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as unknown
}

/** Own-property write that is safe for any key, including "__proto__" from parsed JSON. */
export function putOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
}

export function upgradeV1(raw: Record<string, unknown>): DesignV2 {
  const groups: Partial<Record<V1Group, Record<string, unknown>>> = {}
  const legacy: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (key === 'schemaVersion') continue
    const copy = cloneJson(raw[key])
    if (copy === undefined) continue
    const group = (V1_GROUP_OF as Record<string, V1Group | undefined>)[key]
    if (group) {
      const bucket = groups[group] ?? {}
      putOwn(bucket, key, copy)
      groups[group] = bucket
    } else {
      putOwn(legacy, key, copy)
    }
  }
  const out: DesignV2 = { schemaVersion: 2 }
  if (Object.keys(groups).length > 0) out.groups = groups
  if (Object.keys(legacy).length > 0) out.legacy = legacy
  return out
}

/** The v1 flat design for a unified value: the exact inverse of upgradeV1. */
export function downgradeV1(design: DesignV2): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const entries of [...Object.values(design.groups ?? {}), design.legacy ?? {}]) {
    for (const [key, value] of Object.entries(entries ?? {})) putOwn(out, key, cloneJson(value))
  }
  return out
}
