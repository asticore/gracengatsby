// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { getSchedule, setSchedule, clearSchedule, listDue, markDone, type ScheduleEntry } from '@/cms/db/scheduledPublishes'

describe('scheduledPublishes data access', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: ReturnType<typeof drizzle>

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    db = drizzle(proxy.env.D1) as any
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('stores and retrieves a schedule', async () => {
    const schedule: ScheduleEntry = {
      publishAt: '2024-10-10T10:00:00Z',
      unpublishAt: '2024-10-20T10:00:00Z',
    }
    await setSchedule(db, 'pages', 123, schedule)
    const retrieved = await getSchedule(db, 'pages', 123)
    expect(retrieved).toEqual(schedule)
  })

  it('stores a schedule with only publishAt', async () => {
    const schedule: ScheduleEntry = {
      publishAt: '2024-10-15T12:00:00Z',
      unpublishAt: null,
    }
    await setSchedule(db, 'posts', 456, schedule)
    const retrieved = await getSchedule(db, 'posts', 456)
    expect(retrieved).toEqual(schedule)
  })

  it('returns null for non-existent schedule', async () => {
    const result = await getSchedule(db, 'events', 999)
    expect(result).toBeNull()
  })

  it('updates a schedule', async () => {
    const old: ScheduleEntry = {
      publishAt: '2024-10-10T10:00:00Z',
      unpublishAt: null,
    }
    const updated: ScheduleEntry = {
      publishAt: '2024-10-10T10:00:00Z',
      unpublishAt: '2024-10-30T10:00:00Z',
    }
    await setSchedule(db, 'pages', 789, old)
    await setSchedule(db, 'pages', 789, updated)
    const retrieved = await getSchedule(db, 'pages', 789)
    expect(retrieved).toEqual(updated)
  })

  it('resets done flag when publishAt changes', async () => {
    const schedule1: ScheduleEntry = {
      publishAt: '2024-10-10T10:00:00Z',
      unpublishAt: null,
    }
    const schedule2: ScheduleEntry = {
      publishAt: '2024-10-15T10:00:00Z',
      unpublishAt: null,
    }
    await setSchedule(db, 'pages', 200, schedule1)
    await markDone(db, 'pages', 200, 'publish')

    // Verify publish_done is 1
    let result = await proxy.env.D1.prepare(
      `SELECT publish_done FROM \`eg_scheduled_publishes\` WHERE collection = 'pages' AND doc_id = 200`
    ).all()
    const rows = result.results as { publish_done: number }[]
    expect(rows[0]?.publish_done).toBe(1)

    // Change publishAt - done flag should reset
    await setSchedule(db, 'pages', 200, schedule2)
    result = await proxy.env.D1.prepare(
      `SELECT publish_done FROM \`eg_scheduled_publishes\` WHERE collection = 'pages' AND doc_id = 200`
    ).all()
    const updated = result.results as { publish_done: number }[]
    expect(updated[0]?.publish_done).toBe(0)
  })

  it('clears a schedule', async () => {
    const schedule: ScheduleEntry = {
      publishAt: '2024-10-10T10:00:00Z',
      unpublishAt: null,
    }
    await setSchedule(db, 'pages', 300, schedule)
    let retrieved = await getSchedule(db, 'pages', 300)
    expect(retrieved).not.toBeNull()

    await clearSchedule(db, 'pages', 300)
    retrieved = await getSchedule(db, 'pages', 300)
    expect(retrieved).toBeNull()
  })

  it('lists due publishes in order', async () => {
    const now = new Date().toISOString()
    const past = new Date(Date.now() - 60000).toISOString() // 1 min ago
    const future = new Date(Date.now() + 60000).toISOString() // 1 min from now

    // Clear any prior test data
    await proxy.env.D1.prepare(`DELETE FROM \`eg_scheduled_publishes\``).run()

    // Set up test schedules
    await setSchedule(db, 'pages', 101, { publishAt: past, unpublishAt: null })
    await setSchedule(db, 'posts', 102, { publishAt: future, unpublishAt: null })
    await setSchedule(db, 'events', 103, { publishAt: past, unpublishAt: null })
    await setSchedule(db, 'pages', 104, { publishAt: null, unpublishAt: past })

    // Mark one as done
    await markDone(db, 'pages', 101, 'publish')

    // List due
    const due = await listDue(db, now)
    const publishDue = due.filter((d) => d.action === 'publish')
    const unpublishDue = due.filter((d) => d.action === 'unpublish')

    // Should have events:103 as due publish (101 is marked done, 102 is in future)
    expect(publishDue.some((d) => d.collection === 'events' && d.docId === 103)).toBe(true)
    expect(publishDue.some((d) => d.collection === 'posts' && d.docId === 102)).toBe(false) // future

    // Should have pages:104 as due unpublish
    expect(unpublishDue.some((d) => d.collection === 'pages' && d.docId === 104)).toBe(true)
  })

  it('marks publish as done', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_scheduled_publishes\``).run()
    const schedule: ScheduleEntry = {
      publishAt: '2024-10-10T10:00:00Z',
      unpublishAt: null,
    }
    await setSchedule(db, 'pages', 400, schedule)
    await markDone(db, 'pages', 400, 'publish')

    const result = await proxy.env.D1.prepare(
      `SELECT publish_done FROM \`eg_scheduled_publishes\` WHERE collection = 'pages' AND doc_id = 400`
    ).all()
    const rows = result.results as { publish_done: number }[]
    expect(rows[0]?.publish_done).toBe(1)
  })

  it('marks unpublish as done', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_scheduled_publishes\``).run()
    const schedule: ScheduleEntry = {
      publishAt: null,
      unpublishAt: '2024-10-20T10:00:00Z',
    }
    await setSchedule(db, 'posts', 500, schedule)
    await markDone(db, 'posts', 500, 'unpublish')

    const result = await proxy.env.D1.prepare(
      `SELECT unpublish_done FROM \`eg_scheduled_publishes\` WHERE collection = 'posts' AND doc_id = 500`
    ).all()
    const rows = result.results as { unpublish_done: number }[]
    expect(rows[0]?.unpublish_done).toBe(1)
  })

  it('isolates schedules by collection and docId', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_scheduled_publishes\``).run()
    const sched1: ScheduleEntry = { publishAt: '2024-10-01T00:00:00Z', unpublishAt: null }
    const sched2: ScheduleEntry = { publishAt: '2024-10-02T00:00:00Z', unpublishAt: null }
    const sched3: ScheduleEntry = { publishAt: '2024-10-03T00:00:00Z', unpublishAt: null }

    await setSchedule(db, 'pages', 600, sched1)
    await setSchedule(db, 'posts', 600, sched2)
    await setSchedule(db, 'pages', 700, sched3)

    expect(await getSchedule(db, 'pages', 600)).toEqual(sched1)
    expect(await getSchedule(db, 'posts', 600)).toEqual(sched2)
    expect(await getSchedule(db, 'pages', 700)).toEqual(sched3)
  })
})
