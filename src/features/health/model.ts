/**
 * The pure half of Site health: the numbers the screen shows and the warning
 * rules. Nothing here reads a database or a binding, so every branch can be
 * tested with plain values. collect.ts gathers the inputs.
 */

/**
 * Cloudflare's per-database D1 size limit on the paid plan. The free plan allows
 * far less (500 MB per database), so the warning here is a paid-plan reading.
 */
export const D1_DATABASE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024

/** The database size warning starts at this percentage of the limit. */
export const D1_WARN_PERCENT = 70

/** Most tables whose row counts are read. Keeps the screen fast on large sites. */
export const MAX_TABLES_COUNTED = 60

/** How many of the largest tables are listed. */
export const TOP_TABLES_SHOWN = 10

/** Most R2 objects listed in one go. Totals past this are marked as a sample. */
export const R2_SAMPLE_LIMIT = 1000

/** A successful backup older than this is flagged when backups are switched on. */
export const BACKUP_STALE_DAYS = 7

export type Warning = { level: 'bad' | 'warn'; text: string }

/** Share of a limit as a percentage with one decimal place. Null when the inputs cannot give one. */
export function percentOf(value: number | null, limit: number): number | null {
  if (value === null || !Number.isFinite(value) || limit <= 0) return null
  return Math.round((value / limit) * 1000) / 10
}

/** True when a timestamp is older than the given number of days, or when it is missing or unreadable. */
export function isOlderThanDays(iso: string | null, days: number, now: Date): boolean {
  if (!iso) return true
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return true
  return now.getTime() - at > days * 24 * 60 * 60 * 1000
}

export type WarningInput = {
  cronStale: boolean
  cronNeverRan: boolean
  databasePercent: number | null
  backupsEnabled: boolean
  lastBackupAt: string | null
  emailConnected: boolean
  siteIndexable: boolean
  maintenanceOn: boolean
  failedJobs: { label: string; error: string }[]
}

/** The list the Site health screen shows at the top. Empty when nothing needs attention. */
export function buildWarnings(input: WarningInput, now: Date): Warning[] {
  const warnings: Warning[] = []

  if (input.cronNeverRan) {
    warnings.push({ level: 'bad', text: 'The scheduled jobs have never run. Scheduled publishing and emails will not happen until they do.' })
  } else if (input.cronStale) {
    warnings.push({ level: 'bad', text: 'The scheduled jobs have not run in the last 15 minutes. Scheduled publishing and emails are waiting.' })
  }

  if (input.databasePercent !== null && input.databasePercent >= D1_WARN_PERCENT) {
    warnings.push({ level: 'warn', text: `The database is ${input.databasePercent}% full of its size limit. Remove old data or check the storage plan.` })
  }

  if (input.backupsEnabled && isOlderThanDays(input.lastBackupAt, BACKUP_STALE_DAYS, now)) {
    warnings.push({ level: 'warn', text: 'No successful backup in the last 7 days, although backups are switched on.' })
  }

  if (!input.emailConnected) {
    warnings.push({ level: 'warn', text: 'Email is not connected. Form notifications, order emails and reminders cannot be sent.' })
  }

  if (!input.siteIndexable) {
    warnings.push({ level: 'warn', text: 'Search engines are asked not to index this site.' })
  }

  if (input.maintenanceOn) {
    warnings.push({ level: 'warn', text: 'Maintenance mode is on. Visitors see the maintenance screen instead of the site.' })
  }

  for (const job of input.failedJobs) {
    warnings.push({ level: 'warn', text: `The last run of "${job.label}" failed: ${job.error}` })
  }

  return warnings
}

/** Names of the feature flags that are on, in registry order. */
export function enabledFeatureNames(flags: Record<string, boolean>, labels: Record<string, string>): string[] {
  return Object.keys(labels).filter((key) => flags[key]).map((key) => labels[key])
}
