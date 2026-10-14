// @vitest-environment node
// Wave 17: the cron run history. Pure rules, the runJob recorder against a fake D1,
// and a check that the registry names match the jobs the cron route runs.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CRON_JOBS, cronJobNames } from '@/features/cron/registry'
import { CRON_ERROR_CAP, clipError, durationMs, isCronStale, isHourlyTick, retentionCutoff } from '@/features/cron/model'
import { runJob } from '@/features/cron/runJob'

type Row = Record<string, unknown>

/** A tiny D1 stand-in that remembers the cron rows and answers the statements runJob sends. */
function fakeCronDb() {
  const rows: Row[] = []
  let nextId = 1
  const statements: string[] = []
  const db = {
    prepare(sql: string) {
      statements.push(sql)
      let bound: unknown[] = []
      const statement = {
        bind(...values: unknown[]) {
          bound = values
          return statement
        },
        async all() {
          if (sql.startsWith('INSERT INTO `eg_cron_runs`')) {
            const [job, startedAt] = bound as [string, string]
            const row: Row = { id: nextId++, job, started_at: startedAt, finished_at: null, ok: null, error: null, duration_ms: null }
            rows.push(row)
            return { results: [{ id: row.id }] }
          }
          return { results: [] }
        },
        async run() {
          if (sql.startsWith('UPDATE `eg_cron_runs`')) {
            const [finishedAt, ok, error, duration, id] = bound as [string, number, string | null, number | null, number]
            const row = rows.find((r) => r.id === id)
            if (row) Object.assign(row, { finished_at: finishedAt, ok, error, duration_ms: duration })
          }
          if (sql.startsWith('DELETE FROM `eg_cron_runs`')) {
            const cutoff = bound[0] as string
            for (let i = rows.length - 1; i >= 0; i--) if ((rows[i].started_at as string) < cutoff) rows.splice(i, 1)
          }
          return {}
        },
      }
      return statement
    },
  }
  return { db: db as unknown as D1Database, rows, statements }
}

const at = (iso: string) => () => new Date(iso)
const quietReport = async () => {}

describe('cron model', () => {
  it('treats the first five minutes of an hour as the hourly tick', () => {
    expect(isHourlyTick(new Date('2026-10-14T03:00:00Z'))).toBe(true)
    expect(isHourlyTick(new Date('2026-10-14T03:04:59Z'))).toBe(true)
    expect(isHourlyTick(new Date('2026-10-14T03:05:00Z'))).toBe(false)
    expect(isHourlyTick(new Date('2026-10-14T03:40:00Z'))).toBe(false)
  })

  it('keeps 14 days of run rows', () => {
    expect(retentionCutoff(new Date('2026-10-14T00:00:00Z'))).toBe('2026-09-30T00:00:00.000Z')
  })

  it('calls the cron stale after 15 minutes of silence, and a never-run cron stale too', () => {
    const now = new Date('2026-10-14T12:00:00Z')
    expect(isCronStale('2026-10-14T11:50:00Z', now)).toBe(false)
    expect(isCronStale('2026-10-14T11:44:59Z', now)).toBe(true)
    expect(isCronStale(null, now)).toBe(true)
    expect(isCronStale('not a date', now)).toBe(true)
  })

  it('reads a duration between two timestamps and refuses bad input', () => {
    expect(durationMs('2026-10-14T12:00:00.000Z', '2026-10-14T12:00:02.500Z')).toBe(2500)
    expect(durationMs('2026-10-14T12:00:02.500Z', '2026-10-14T12:00:00.000Z')).toBe(0)
    expect(durationMs('nope', '2026-10-14T12:00:00Z')).toBeNull()
  })

  it('clips error text to the stored cap and never stores an empty message', () => {
    expect(clipError(new Error('boom'))).toBe('boom')
    expect(clipError('  spaced  ')).toBe('spaced')
    expect(clipError(undefined)).toBe('Unknown error')
    expect(clipError('')).toBe('Unknown error')
    const long = clipError('x'.repeat(2000))
    expect(long.length).toBe(CRON_ERROR_CAP)
    expect(long.endsWith('...')).toBe(true)
  })
})

describe('runJob', () => {
  it('records a successful run with its start, finish and duration', async () => {
    const fake = fakeCronDb()
    const clock = [at('2026-10-14T12:00:00Z'), at('2026-10-14T12:00:01.200Z')]
    let calls = 0
    const outcome = await runJob('schedules', async () => 'done', {
      deps: { db: fake.db, now: () => clock[Math.min(calls++, 1)](), report: quietReport },
    })
    expect(outcome).toEqual({ status: 'ok', value: 'done' })
    expect(fake.rows).toHaveLength(1)
    expect(fake.rows[0]).toMatchObject({ job: 'schedules', ok: 1, error: null, duration_ms: 1200 })
    expect(fake.rows[0].finished_at).toBe('2026-10-14T12:00:01.200Z')
  })

  it('records a failure, reports it, and does not throw', async () => {
    const fake = fakeCronDb()
    const reported: { source: string; message: string }[] = []
    const outcome = await runJob(
      'pagespeed',
      async () => {
        throw new Error('quota exceeded')
      },
      {
        deps: {
          db: fake.db,
          now: at('2026-10-14T12:07:00Z'),
          report: async (source, message) => {
            reported.push({ source, message })
          },
        },
      },
    )
    expect(outcome).toEqual({ status: 'failed', error: 'quota exceeded' })
    expect(fake.rows[0]).toMatchObject({ job: 'pagespeed', ok: 0, error: 'quota exceeded' })
    expect(reported).toEqual([{ source: 'cron:pagespeed', message: 'quota exceeded' }])
  })

  it('does nothing and writes no row when the job is not due this tick', async () => {
    const fake = fakeCronDb()
    let ran = false
    const outcome = await runJob(
      'prune-submissions',
      async () => {
        ran = true
      },
      { due: false, deps: { db: fake.db, now: at('2026-10-14T12:30:00Z'), report: quietReport } },
    )
    expect(outcome).toEqual({ status: 'skipped' })
    expect(ran).toBe(false)
    expect(fake.rows).toHaveLength(0)
  })

  it('prunes rows past retention only on the hourly tick', async () => {
    const fake = fakeCronDb()
    fake.rows.push({ id: 900, job: 'old', started_at: '2026-09-01T00:00:00.000Z', finished_at: null, ok: 1, error: null, duration_ms: null })

    await runJob('schedules', async () => 1, { deps: { db: fake.db, now: at('2026-10-14T12:30:00Z'), report: quietReport } })
    expect(fake.rows.some((r) => r.id === 900)).toBe(true)

    await runJob('schedules', async () => 1, { deps: { db: fake.db, now: at('2026-10-14T13:02:00Z'), report: quietReport } })
    expect(fake.rows.some((r) => r.id === 900)).toBe(false)
  })

  it('still runs the job when there is no database, and never throws', async () => {
    const outcome = await runJob('schedules', async () => 7, { deps: { db: null, now: at('2026-10-14T12:00:00Z'), report: quietReport } })
    expect(outcome).toEqual({ status: 'ok', value: 7 })
  })

  it('swallows a failure inside the error reporter', async () => {
    const outcome = await runJob(
      'gift-cards',
      async () => {
        throw new Error('bad')
      },
      {
        deps: {
          db: null,
          now: at('2026-10-14T12:00:00Z'),
          report: async () => {
            throw new Error('log down')
          },
        },
      },
    )
    expect(outcome.status).toBe('failed')
  })
})

describe('cron registry', () => {
  it('names every job the cron route runs, and only those', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/(engage)/api/cron/publish-scheduled/route.ts'), 'utf8')
    const used = [...route.matchAll(/runJob\(\s*'([a-z-]+)'/g)].map((match) => match[1]).sort()
    expect(used).toEqual([...cronJobNames()].sort())
  })

  it('gives every job a label, a description and a schedule', () => {
    for (const job of CRON_JOBS) {
      expect(job.label.length, job.name).toBeGreaterThan(0)
      expect(job.description.length, job.name).toBeGreaterThan(20)
      expect(job.schedule.length, job.name).toBeGreaterThan(0)
    }
    expect(new Set(CRON_JOBS.map((job) => job.name)).size).toBe(CRON_JOBS.length)
  })
})
