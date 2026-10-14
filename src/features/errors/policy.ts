/**
 * The rules of the error log, as pure functions: when a repeat is counted
 * instead of stored again, which rows are removed to keep the log small, and
 * how long resolved entries are kept. The engine reads and writes live in log.ts.
 */

/** A repeat of the same error within this window is counted, not stored again. */
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

/** Most rows the log keeps. Past this, the oldest entries are removed. */
export const ERROR_LOG_CAP = 1000

/** Ignored and fixed entries are removed this many days after they were last seen. */
export const RESOLVED_RETENTION_DAYS = 30

export const MESSAGE_CAP = 1000
export const STACK_CAP = 4000
export const PATH_CAP = 500
export const USER_AGENT_CAP = 200
export const SOURCE_CAP = 60

export type ErrorStatus = 'open' | 'ignored' | 'fixed'

export type ExistingEntry = { id: number; count: number; lastSeen: string }

export type DedupeDecision = { action: 'create' } | { action: 'increment'; id: number; count: number }

/**
 * What to do with an error whose fingerprint was seen recently. `existing` is
 * the newest entry with the same fingerprint inside the window, or null.
 * Never throws; a missing or unreadable date counts as "not recent".
 */
export function decideDedupe(existing: ExistingEntry | null, nowMs: number, windowMs: number = DEDUPE_WINDOW_MS): DedupeDecision {
  if (!existing) return { action: 'create' }
  const last = Date.parse(existing.lastSeen)
  if (!Number.isFinite(last)) return { action: 'create' }
  const age = nowMs - last
  if (age < 0 || age > windowMs) return { action: 'create' }
  const counted = Number.isFinite(Number(existing.count)) ? Math.max(1, Number(existing.count)) : 1
  return { action: 'increment', id: existing.id, count: counted + 1 }
}

export type TrimCandidate = { id: number; status: ErrorStatus | string; lastSeen: string }

/**
 * The ids to remove so that `total` rows come down to `cap`. Resolved rows
 * (ignored, fixed) go first, oldest first; open rows only when there are not
 * enough resolved ones. Returns at most `batch` ids.
 */
export function planTrim(candidates: TrimCandidate[], total: number, cap: number = ERROR_LOG_CAP, batch = 200): number[] {
  const excess = Math.min(total - cap, batch)
  if (excess <= 0) return []
  const byAge = (a: TrimCandidate, b: TrimCandidate): number => Date.parse(a.lastSeen) - Date.parse(b.lastSeen) || a.id - b.id
  const resolved = candidates.filter((row) => row.status !== 'open').sort(byAge)
  const open = candidates.filter((row) => row.status === 'open').sort(byAge)
  return [...resolved, ...open].slice(0, excess).map((row) => row.id)
}

/** The ISO time before which resolved entries are removed. */
export function resolvedCutoff(nowMs: number, days: number = RESOLVED_RETENTION_DAYS): string {
  return new Date(nowMs - days * 86_400_000).toISOString()
}

/** The ISO time before which a repeat no longer counts as the same error. */
export function dedupeCutoff(nowMs: number, windowMs: number = DEDUPE_WINDOW_MS): string {
  return new Date(nowMs - windowMs).toISOString()
}

/** Whether housekeeping should run again, given when it last ran. At most once every ten minutes per isolate. */
export function housekeepingDue(lastRunMs: number, nowMs: number): boolean {
  return nowMs - lastRunMs >= 10 * 60 * 1000
}
