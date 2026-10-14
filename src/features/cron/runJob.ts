import { clipError, durationMs, isHourlyTick, retentionCutoff } from './model'

/**
 * Runs one scheduled job and records it in `eg_cron_runs`.
 *
 * A job that throws is recorded as failed and reported through logError (the
 * error log), and the cron route carries on with the next job. runJob itself
 * never throws, so one broken job cannot stop the rest of the tick.
 *
 * Each run writes a row when it starts and fills it in when it finishes. A row
 * with no finished_at is a run that never came back, which the screen shows.
 */

export type JobOutcome<T> = { status: 'ok'; value: T } | { status: 'failed'; error: string } | { status: 'skipped' }

export type RunJobOptions = {
  /** False skips the job this tick without writing a row (used for hourly jobs). */
  due?: boolean
  /** Replaces the Worker bindings and clock. Tests use this; the cron route does not. */
  deps?: Partial<JobDeps>
}

export type JobDeps = {
  db: D1Database | null
  now: () => Date
  report: (source: string, message: string, error: unknown) => Promise<void>
}

async function defaultDeps(): Promise<JobDeps> {
  let db: D1Database | null = null
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    db = (env as { D1?: D1Database }).D1 ?? null
  } catch {
    db = null
  }
  return { db, now: () => new Date(), report: reportToErrorLog }
}

/** Hands the failure to the error log. Falls back to the console when that module is unavailable. */
async function reportToErrorLog(source: string, message: string, error: unknown): Promise<void> {
  try {
    const { logError } = await import('@/features/errors/log')
    await logError({ source, message, error })
  } catch {
    console.error(`${source} failed:`, message, error)
  }
}

async function startRun(db: D1Database, job: string, startedAt: string): Promise<number | null> {
  try {
    const result = await db
      .prepare('INSERT INTO `eg_cron_runs` (job, started_at) VALUES (?, ?) RETURNING id')
      .bind(job, startedAt)
      .all()
    const id = (result.results?.[0] as { id?: number } | undefined)?.id
    return typeof id === 'number' ? id : null
  } catch {
    return null
  }
}

async function finishRun(db: D1Database, id: number, finishedAt: string, ok: boolean, error: string | null, duration: number | null): Promise<void> {
  try {
    await db
      .prepare('UPDATE `eg_cron_runs` SET finished_at = ?, ok = ?, error = ?, duration_ms = ? WHERE id = ?')
      .bind(finishedAt, ok ? 1 : 0, error, duration, id)
      .run()
  } catch {
    // The run already happened; a missing finish time just shows as unfinished.
  }
}

/** Removes run rows past the retention period. Only on the first tick of the hour, so it stays cheap. */
async function pruneRuns(db: D1Database, now: Date): Promise<void> {
  try {
    await db.prepare('DELETE FROM `eg_cron_runs` WHERE started_at < ?').bind(retentionCutoff(now)).run()
  } catch {
    // Pruning is housekeeping; a failure leaves the rows for the next hour.
  }
}

export async function runJob<T>(name: string, fn: () => Promise<T>, options: RunJobOptions = {}): Promise<JobOutcome<T>> {
  if (options.due === false) return { status: 'skipped' }

  const deps: JobDeps = { ...(await defaultDeps()), ...options.deps }
  const startedAt = deps.now()
  const runId = deps.db ? await startRun(deps.db, name, startedAt.toISOString()) : null

  let outcome: JobOutcome<T>
  try {
    outcome = { status: 'ok', value: await fn() }
  } catch (error) {
    const message = clipError(error)
    outcome = { status: 'failed', error: message }
    try {
      await deps.report(`cron:${name}`, message, error)
    } catch {
      // Reporting is best effort.
    }
  }

  const finishedAt = deps.now()
  if (deps.db && runId !== null) {
    const failure = outcome.status === 'failed' ? outcome.error : null
    await finishRun(deps.db, runId, finishedAt.toISOString(), outcome.status === 'ok', failure, durationMs(startedAt.toISOString(), finishedAt.toISOString()))
  }
  if (deps.db && isHourlyTick(finishedAt)) await pruneRuns(deps.db, finishedAt)

  return outcome
}
