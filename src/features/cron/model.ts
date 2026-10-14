/**
 * Pure rules for the cron run history: what counts as a stale cron, how long
 * a run row is kept, and how an error becomes a short stored message. No
 * database or Worker objects here, so the spec can test every branch.
 */

/** Run rows older than this are removed by the hourly housekeeping. */
export const CRON_RUN_RETENTION_DAYS = 14

/** Longest error text stored on a run row. */
export const CRON_ERROR_CAP = 500

/** The cron fires every five minutes. Past this much silence the site shows a warning. */
export const CRON_STALE_MINUTES = 15

/** The job every cron tick runs, so its rows show when the cron last fired. */
export const CRON_HEARTBEAT_JOB = 'schedules'

/** Hourly jobs run on the first tick of each hour: minutes 0 to 4 past the hour. */
export function isHourlyTick(now: Date): boolean {
  return now.getUTCMinutes() < 5
}

/** ISO timestamp before which run rows are removed. */
export function retentionCutoff(now: Date): string {
  return new Date(now.getTime() - CRON_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** Duration between two ISO timestamps in whole milliseconds, or null when either is missing or unreadable. */
export function durationMs(startedAt: string, finishedAt: string): number | null {
  const start = Date.parse(startedAt)
  const end = Date.parse(finishedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, end - start)
}

/** Plain text of an error, trimmed to the stored cap. Never returns an empty string. */
export function clipError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  const text = raw.trim() || 'Unknown error'
  return text.length > CRON_ERROR_CAP ? `${text.slice(0, CRON_ERROR_CAP - 3)}...` : text
}

/**
 * True when the cron has not fired recently enough. A missing heartbeat (never
 * run, or the table is empty) also counts as stale.
 */
export function isCronStale(lastTickAt: string | null | undefined, now: Date): boolean {
  if (!lastTickAt) return true
  const last = Date.parse(lastTickAt)
  if (!Number.isFinite(last)) return true
  return now.getTime() - last > CRON_STALE_MINUTES * 60 * 1000
}
