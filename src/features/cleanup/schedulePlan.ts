/**
 * The pure rules behind the hourly clean-up: what the Speed settings ask for,
 * turned into a list of steps with cut-off times. Nothing in here touches the
 * database or the engine - scheduledCleanup.ts does that, using these results.
 */

import { EMAIL_LOG_RETENTION_DAYS } from '@/features/email/emailLog'

export type CleanupPolicy = {
  enabled: boolean
  keepVersionsPerDoc: number
  deleteTrashedAfterDays: number
  deleteFormSubmissionsAfterDays: number
  deleteAuditLogAfterDays: number
  deleteEmailLogAfterDays: number
}

export const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  enabled: false,
  keepVersionsPerDoc: 20,
  deleteTrashedAfterDays: 30,
  deleteFormSubmissionsAfterDays: 0,
  deleteAuditLogAfterDays: 180,
  deleteEmailLogAfterDays: EMAIL_LOG_RETENTION_DAYS,
}

/** Most rows removed across all steps in one hourly run. A backlog clears over several hours. */
export const CLEANUP_BATCH = 200

const DAY_MS = 86_400_000
const MAX_DAYS = 3650

export type CleanupStep =
  | { kind: 'versions'; keep: number }
  | { kind: 'trash'; cutoff: string }
  | { kind: 'forms'; cutoff: string }
  | { kind: 'audit'; cutoff: string }

const whole = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

/**
 * Reads the stored clean-up group. Anything missing or malformed falls back to
 * the default, so a half-migrated row never causes a surprise delete.
 */
export function cleanupPolicyFrom(raw: unknown): CleanupPolicy {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    // D1 stores checkboxes as 0/1, so both spellings count as on.
    enabled: row.enabled === true || row.enabled === 1,
    keepVersionsPerDoc: whole(row.keepVersionsPerDoc, DEFAULT_CLEANUP_POLICY.keepVersionsPerDoc, 1, 1000),
    deleteTrashedAfterDays: whole(row.deleteTrashedAfterDays, DEFAULT_CLEANUP_POLICY.deleteTrashedAfterDays, 0, MAX_DAYS),
    deleteFormSubmissionsAfterDays: whole(row.deleteFormSubmissionsAfterDays, 0, 0, MAX_DAYS),
    deleteAuditLogAfterDays: whole(row.deleteAuditLogAfterDays, DEFAULT_CLEANUP_POLICY.deleteAuditLogAfterDays, 0, MAX_DAYS),
    deleteEmailLogAfterDays: whole(row.deleteEmailLogAfterDays, DEFAULT_CLEANUP_POLICY.deleteEmailLogAfterDays, 1, MAX_DAYS),
  }
}

/** ISO cut-off `days` before `now`. Zero or less means "never", so no cut-off at all. */
export function cutoffFor(now: Date, days: number): string | null {
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(now.getTime() - days * DAY_MS).toISOString()
}

/** Which steps a run performs. Empty while clean-up is off. */
export function planCleanup(policy: CleanupPolicy, now: Date): CleanupStep[] {
  if (!policy.enabled) return []
  const steps: CleanupStep[] = [{ kind: 'versions', keep: policy.keepVersionsPerDoc }]
  const trash = cutoffFor(now, policy.deleteTrashedAfterDays)
  if (trash) steps.push({ kind: 'trash', cutoff: trash })
  const forms = cutoffFor(now, policy.deleteFormSubmissionsAfterDays)
  if (forms) steps.push({ kind: 'forms', cutoff: forms })
  const audit = cutoffFor(now, policy.deleteAuditLogAfterDays)
  if (audit) steps.push({ kind: 'audit', cutoff: audit })
  return steps
}

/**
 * Email log retention used by the cron's email prune. The setting only takes
 * over while clean-up is on; otherwise the built-in rule stands.
 */
export function emailRetentionDays(policy: CleanupPolicy): number {
  return policy.enabled ? policy.deleteEmailLogAfterDays : EMAIL_LOG_RETENTION_DAYS
}

/** True when an ISO timestamp is strictly older than the cut-off. Unparseable stamps are never old enough. */
export function isOlderThan(stamp: string | null | undefined, cutoff: string): boolean {
  if (!stamp) return false
  const at = Date.parse(stamp)
  const limit = Date.parse(cutoff)
  if (!Number.isFinite(at) || !Number.isFinite(limit)) return false
  return at < limit
}

/** Version tables are `_<collection table>_v`. Child tables of versions (`..._v_blocks_...`) do not end in `_v` and are left to cascade. */
export function versionTablesFrom(tables: string[]): string[] {
  const skip = new Set(['_eg_users_v', '_eg_media_v'])
  return tables.filter((name) => name.startsWith('_eg_') && name.endsWith('_v') && !skip.has(name))
}

/** Only a fixed, generated-looking ISO timestamp may be placed into raw SQL. */
export function isSafeIsoStamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)
}
