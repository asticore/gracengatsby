import { upgradeV1 } from './upgradeV1'
import type { DesignError, DesignV2, UpgradeResult } from './types'

/**
 * Reads any stored design value and returns a v2 design. Never throws.
 *
 * - null, arrays and non-objects read as an empty v2 design.
 * - no schemaVersion, or 1: the flat v1 shape, converted by upgradeV1.
 * - 2: returned as a deep copy, so upgrading twice gives the same result.
 * - anything else: a DesignError, so the caller can fail loudly. Versions
 *   above 2 are never guessed at.
 */
export const DESIGN_SCHEMA_VERSION = 2

export function upgradeDesign(raw: unknown): UpgradeResult {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { schemaVersion: DESIGN_SCHEMA_VERSION }
    }
    const record = raw as Record<string, unknown>
    const version = record.schemaVersion
    if (version === undefined || version === 1) return upgradeV1(record)
    if (version === DESIGN_SCHEMA_VERSION) return cloneV2(record)
    if (typeof version === 'number' && version > DESIGN_SCHEMA_VERSION) {
      return {
        error: 'unsupported-schema-version',
        version,
        message: `Design schema version ${version} is newer than this editor supports (${DESIGN_SCHEMA_VERSION}).`,
      }
    }
    return {
      error: 'invalid-schema-version',
      version,
      message: 'Design schema version is not a known number.',
    }
  } catch {
    return { error: 'invalid-schema-version', version: null, message: 'Design value could not be read.' }
  }
}

/** True for a v2 design value (used by the renderer to pick the v2 path). */
export function isDesignV2Raw(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) && (raw as { schemaVersion?: unknown }).schemaVersion === DESIGN_SCHEMA_VERSION
}

export function isDesignError(result: UpgradeResult): result is DesignError {
  return typeof (result as DesignError).error === 'string'
}

/** JSON round trip, so the result shares no references with the stored value. Falls back to empty on cycles. */
function cloneV2(record: Record<string, unknown>): DesignV2 {
  try {
    return JSON.parse(JSON.stringify(record)) as DesignV2
  } catch {
    return { schemaVersion: DESIGN_SCHEMA_VERSION }
  }
}
