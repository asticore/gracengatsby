// @vitest-environment node
// Wave 17: Site health and Scheduled tasks. The pure builders and formatters, the
// pending-action list, and the table count reader against a fake D1.
import { describe, expect, it } from 'vitest'

import { formatBytes } from '@/features/cleanup/size'
import { buildWarnings, D1_WARN_PERCENT, isOlderThanDays, percentOf, MAX_TABLES_COUNTED, type WarningInput } from '@/features/health/model'
import { formatAgo, formatDuration, formatPercent, formatWhen } from '@/features/health/format'
import { topTables } from '@/features/health/storage'
import { pendingActions, titleKey, type ScheduleRow } from '@/features/cron/pending'

const NOW = new Date('2026-10-14T12:00:00Z')

const healthy: WarningInput = {
  cronStale: false,
  cronNeverRan: false,
  databasePercent: 12,
  backupsEnabled: true,
  lastBackupAt: '2026-10-13T03:00:00Z',
  emailConnected: true,
  siteIndexable: true,
  maintenanceOn: false,
  failedJobs: [],
}

describe('site health warnings', () => {
  it('shows nothing when the site is healthy', () => {
    expect(buildWarnings(healthy, NOW)).toEqual([])
  })

  it('says the cron has never run, and not also that it is stale', () => {
    const list = buildWarnings({ ...healthy, cronNeverRan: true, cronStale: true }, NOW)
    expect(list.filter((w) => w.text.includes('never run'))).toHaveLength(1)
    expect(list.filter((w) => w.text.includes('15 minutes'))).toHaveLength(0)
  })

  it('flags a stale cron as bad', () => {
    const list = buildWarnings({ ...healthy, cronStale: true }, NOW)
    expect(list).toEqual([expect.objectContaining({ level: 'bad' })])
  })

  it('warns from 70 percent of the database limit, not before', () => {
    expect(buildWarnings({ ...healthy, databasePercent: D1_WARN_PERCENT - 0.1 }, NOW)).toHaveLength(0)
    expect(buildWarnings({ ...healthy, databasePercent: D1_WARN_PERCENT }, NOW)).toHaveLength(1)
    expect(buildWarnings({ ...healthy, databasePercent: null }, NOW)).toHaveLength(0)
  })

  it('warns about a stale backup only when backups are on', () => {
    const old = { ...healthy, lastBackupAt: '2026-10-01T03:00:00Z' }
    expect(buildWarnings(old, NOW).map((w) => w.text).join(' ')).toContain('No successful backup')
    expect(buildWarnings({ ...old, backupsEnabled: false }, NOW)).toHaveLength(0)
    expect(buildWarnings({ ...old, lastBackupAt: null }, NOW)).toHaveLength(1)
  })

  it('warns when email is not connected, the site is not indexable, maintenance is on, or a job failed', () => {
    const input: WarningInput = {
      ...healthy,
      emailConnected: false,
      siteIndexable: false,
      maintenanceOn: true,
      failedJobs: [{ label: 'PageSpeed tests', error: 'quota exceeded' }],
    }
    const text = buildWarnings(input, NOW).map((w) => w.text)
    expect(text).toHaveLength(4)
    expect(text.join(' ')).toContain('Email is not connected')
    expect(text.join(' ')).toContain('not to index')
    expect(text.join(' ')).toContain('Maintenance mode is on')
    expect(text.join(' ')).toContain('"PageSpeed tests" failed: quota exceeded')
  })
})

describe('site health numbers', () => {
  it('turns a size into a percentage with one decimal place', () => {
    expect(percentOf(5, 10)).toBe(50)
    expect(percentOf(1, 3)).toBe(33.3)
    expect(percentOf(null, 10)).toBeNull()
    expect(percentOf(5, 0)).toBeNull()
    expect(percentOf(Number.NaN, 10)).toBeNull()
  })

  it('judges whether a timestamp is older than a number of days', () => {
    expect(isOlderThanDays('2026-10-07T11:59:00Z', 7, NOW)).toBe(true)
    expect(isOlderThanDays('2026-10-07T12:01:00Z', 7, NOW)).toBe(false)
    expect(isOlderThanDays(null, 7, NOW)).toBe(true)
    expect(isOlderThanDays('garbage', 7, NOW)).toBe(true)
  })

  it('formats bytes for people, through the shared cleanup formatter', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(500)).toBe('< 1 KB')
    expect(formatBytes(5 * 1024)).toBe('5 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(formatPercent(null)).toBe('Unknown')
    expect(formatPercent(42.5)).toBe('42.5%')
  })

  it('formats durations and relative times', () => {
    expect(formatDuration(850)).toBe('850 ms')
    expect(formatDuration(2400)).toBe('2.4 s')
    expect(formatDuration(null)).toBeNull()
    expect(formatAgo(null, NOW)).toBe('Never')
    expect(formatAgo('2026-10-14T11:59:40Z', NOW)).toBe('Just now')
    expect(formatAgo('2026-10-14T11:55:00Z', NOW)).toBe('5 minutes ago')
    expect(formatAgo('2026-10-14T09:00:00Z', NOW)).toBe('3 hours ago')
    expect(formatAgo('2026-10-12T12:00:00Z', NOW)).toBe('2 days ago')
  })

  it('formats a time in the site time zone, and falls back to UTC for a bad zone', () => {
    const sydney = formatWhen('2026-10-14T00:00:00Z', 'Australia/Sydney')
    expect(sydney).toContain('2026')
    expect(sydney).toContain('11:00')
    expect(formatWhen('2026-10-14T00:00:00Z', 'Not/AZone')).toContain('12:00')
    expect(formatWhen(null, 'UTC')).toBe('Never')
    expect(formatWhen('nope', 'UTC')).toBe('Unknown')
  })
})

describe('table counts', () => {
  it('lists the largest site tables first and skips tables that cannot be counted', async () => {
    const counts: Record<string, number> = { eg_pages: 40, eg_posts: 900, eg_media: 900, eg_broken: 1 }
    const fake = {
      prepare(sql: string) {
        const match = /FROM `([^`]+)`/.exec(sql)
        return {
          async all() {
            if (sql.includes('sqlite_master')) return { results: Object.keys(counts).concat(['eg_gone']).map((name) => ({ name })) }
            const table = match?.[1] ?? ''
            if (table === 'eg_gone') throw new Error('no such table')
            return { results: [{ n: counts[table] }] }
          },
        }
      },
    }
    const result = await topTables(fake as unknown as D1Database)
    expect(result.tables.map((t) => t.name)).toEqual(['eg_media', 'eg_posts', 'eg_pages', 'eg_broken'])
    expect(result.capped).toBe(false)
  })

  it('reports when there are more tables than it counts', async () => {
    const names = Array.from({ length: MAX_TABLES_COUNTED + 5 }, (_, i) => ({ name: `eg_t${i}` }))
    const fake = {
      prepare(sql: string) {
        return {
          async all() {
            return sql.includes('sqlite_master') ? { results: names } : { results: [{ n: 1 }] }
          },
        }
      },
    }
    const result = await topTables(fake as unknown as D1Database)
    expect(result.capped).toBe(true)
    expect(result.counted).toBe(MAX_TABLES_COUNTED)
  })
})

describe('pending scheduled actions', () => {
  const rows: ScheduleRow[] = [
    { collection: 'pages', doc_id: 3, publish_at: '2026-10-20T00:00:00Z', unpublish_at: '2026-10-25T00:00:00Z', publish_done: 0, unpublish_done: 0 },
    { collection: 'posts', doc_id: 8, publish_at: '2026-10-15T00:00:00Z', unpublish_at: null, publish_done: 0, unpublish_done: 0 },
    { collection: 'posts', doc_id: 9, publish_at: '2026-10-01T00:00:00Z', unpublish_at: null, publish_done: 1, unpublish_done: 0 },
    { collection: 'users', doc_id: 1, publish_at: '2026-10-16T00:00:00Z', unpublish_at: null, publish_done: 0, unpublish_done: 0 },
  ]

  it('lists each waiting publish and unpublish, soonest first, with a link to the item', () => {
    const titles = new Map([[titleKey('pages', 3), 'About us']])
    const actions = pendingActions(rows, titles)
    expect(actions.map((a) => `${a.action}:${a.collection}:${a.docId}`)).toEqual(['Publish:posts:8', 'Publish:pages:3', 'Unpublish:pages:3'])
    expect(actions[1]).toMatchObject({ title: 'About us', href: '/admin/collections/pages/3' })
    expect(actions[0].title).toBeNull()
  })

  it('leaves out schedules that are done and collections that cannot be scheduled', () => {
    const actions = pendingActions(rows, new Map())
    expect(actions.some((a) => a.docId === 9)).toBe(false)
    expect(actions.some((a) => a.collection === 'users')).toBe(false)
  })
})
