import { SCHEDULED_COLLECTIONS, pendingActions, titleKey, type PendingAction, type ScheduleRow } from './pending'
import { CRON_HEARTBEAT_JOB } from './model'

/**
 * Reads of `eg_cron_runs` for the Scheduled tasks and Site health screens.
 * Every read returns an empty list when the table is missing or unreadable, so
 * a screen still renders on a database that has not run the migration yet.
 */

export type CronRunRow = {
  job: string
  startedAt: string
  finishedAt: string | null
  ok: boolean | null
  error: string | null
  durationMs: number | null
}

type Raw = {
  job: string
  started_at: string
  finished_at: string | null
  ok: number | null
  error: string | null
  duration_ms: number | null
}

const toRow = (raw: Raw): CronRunRow => ({
  job: raw.job,
  startedAt: raw.started_at,
  finishedAt: raw.finished_at,
  ok: raw.ok === null || raw.ok === undefined ? null : Boolean(raw.ok),
  error: raw.error,
  durationMs: raw.duration_ms === null || raw.duration_ms === undefined ? null : Number(raw.duration_ms),
})

const COLUMNS = 'job, started_at, finished_at, ok, error, duration_ms'

/** The newest run of each job, so the screen shows the last result per job. */
export async function latestRunPerJob(db: D1Database): Promise<CronRunRow[]> {
  try {
    const result = await db
      .prepare(`SELECT ${COLUMNS} FROM \`eg_cron_runs\` WHERE id IN (SELECT MAX(id) FROM \`eg_cron_runs\` GROUP BY job)`)
      .all()
    return ((result.results ?? []) as unknown as Raw[]).map(toRow)
  } catch {
    return []
  }
}

/** Most recent runs across all jobs, newest first. */
export async function recentRuns(db: D1Database, limit = 20): Promise<CronRunRow[]> {
  try {
    const result = await db
      .prepare(`SELECT ${COLUMNS} FROM \`eg_cron_runs\` ORDER BY id DESC LIMIT ?`)
      .bind(Math.max(1, Math.min(200, Math.trunc(limit))))
      .all()
    return ((result.results ?? []) as unknown as Raw[]).map(toRow)
  } catch {
    return []
  }
}

/** Start time of the most recent cron tick, or null when none is recorded. */
export async function lastTickAt(db: D1Database): Promise<string | null> {
  try {
    const result = await db
      .prepare('SELECT started_at FROM `eg_cron_runs` WHERE job = ? ORDER BY id DESC LIMIT 1')
      .bind(CRON_HEARTBEAT_JOB)
      .all()
    return (result.results?.[0] as { started_at?: string } | undefined)?.started_at ?? null
  } catch {
    return null
  }
}

type BackupRaw = { status: string | null; started_at: string | null; finished_at: string | null; error: string | null }

/** Newest backup runs as run rows, newest first. Uses the backups table's own columns. */
export async function recentBackupRuns(db: D1Database, limit = 20): Promise<CronRunRow[]> {
  try {
    const result = await db
      .prepare('SELECT status, started_at, finished_at, error FROM `eg_backups` WHERE started_at IS NOT NULL ORDER BY started_at DESC LIMIT ?')
      .bind(Math.max(1, Math.min(200, Math.trunc(limit))))
      .all()
    return ((result.results ?? []) as unknown as BackupRaw[]).map((row): CronRunRow => ({
      job: 'backups',
      startedAt: row.started_at ?? '',
      finishedAt: row.finished_at,
      ok: row.status === 'success' || row.status === 'partial' ? true : row.status === 'running' ? null : false,
      error: row.error,
      durationMs: null,
    }))
  } catch {
    return []
  }
}

/** Scheduled publishes and unpublishes still to run, soonest first, with the document titles. */
export async function loadPendingActions(db: D1Database, limit = 100): Promise<PendingAction[]> {
  let rows: ScheduleRow[] = []
  try {
    const result = await db
      .prepare(
        `SELECT collection, doc_id, publish_at, unpublish_at, publish_done, unpublish_done FROM \`eg_scheduled_publishes\`
          WHERE (publish_at IS NOT NULL AND publish_done = 0) OR (unpublish_at IS NOT NULL AND unpublish_done = 0)
          ORDER BY COALESCE(publish_at, unpublish_at) LIMIT ?`,
      )
      .bind(Math.max(1, Math.min(500, Math.trunc(limit))))
      .all()
    rows = (result.results ?? []) as unknown as ScheduleRow[]
  } catch {
    return []
  }

  const titles = new Map<string, string | null>()
  for (const collection of SCHEDULED_COLLECTIONS) {
    const ids = rows.filter((row) => row.collection === collection).map((row) => Number(row.doc_id))
    if (ids.length === 0) continue
    try {
      const marks = ids.map(() => '?').join(', ')
      const result = await db.prepare(`SELECT id, title FROM \`eg_${collection}\` WHERE id IN (${marks})`).bind(...ids).all()
      for (const row of (result.results ?? []) as { id: number; title: string | null }[]) {
        titles.set(titleKey(collection, Number(row.id)), row.title)
      }
    } catch {
      // A collection whose table is missing shows its schedules without titles.
    }
  }
  return pendingActions(rows, titles)
}
