import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'
import { selectAll } from '@/db'
import { getOrCreateUser } from '@/api'
import * as schema from '@/db/schema'
import { publishScheduled } from '@/cron'

describe('scheduledPublish', () => {
  let db: any
  let testUserId: number

  beforeAll(async () => {
    const { env } = await getPlatformProxy({ configPath: 'wrangler.toml' })
    if (!env.D1_DATABASE) {
      throw new Error('D1_DATABASE not found in environment')
    }
    db = drizzle(env.D1_DATABASE as any)

    // Create a test user
    const user = await getOrCreateUser(db, 'schedtest@test.com')
    testUserId = user.id
  }, 120_000)

  beforeEach(async () => {
    // Clear schedules before each test
    await db.delete(schema.schedules).where().all()
  })

  afterAll(async () => {
    // Clean up
    await db.delete(schema.schedules).where().all()
  })

  it('publishes a page scheduled for past time', async () => {
    // Create a page (mocked)
    const pastDate = new Date(Date.now() - 1000 * 60 * 5) // 5 minutes ago

    // Create schedule record
    const schedules = await db
      .insert(schema.schedules)
      .values({
        userId: testUserId,
        contentId: 'test-page',
        scheduledAt: pastDate.toISOString(),
        status: 'pending',
      })
      .returning()

    expect(schedules).toHaveLength(1)

    // Run the scheduled publish
    await publishScheduled(db)

    // Check that it was updated
    const updated = await db.select().from(schema.schedules).where().all()
    expect(updated[0].status).not.toBe('pending')
  })

  it('skips schedules in the future', async () => {
    // Create a future schedule
    const futureDate = new Date(Date.now() + 1000 * 60 * 60) // 1 hour from now

    const schedules = await db
      .insert(schema.schedules)
      .values({
        userId: testUserId,
        contentId: 'future-page',
        scheduledAt: futureDate.toISOString(),
        status: 'pending',
      })
      .returning()

    expect(schedules).toHaveLength(1)

    // Run the scheduled publish
    await publishScheduled(db)

    // Should still be pending
    const updated = await db.select().from(schema.schedules).all()
    expect(updated[0].status).toBe('pending')
  })

  it('handles multiple schedules', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60)
    const futureDate = new Date(Date.now() + 1000 * 60)

    // Insert multiple schedules
    await db
      .insert(schema.schedules)
      .values([
        {
          userId: testUserId,
          contentId: 'past-1',
          scheduledAt: pastDate.toISOString(),
          status: 'pending',
        },
        {
          userId: testUserId,
          contentId: 'future-1',
          scheduledAt: futureDate.toISOString(),
          status: 'pending',
        },
        {
          userId: testUserId,
          contentId: 'past-2',
          scheduledAt: new Date(pastDate.getTime() - 1000 * 60).toISOString(),
          status: 'pending',
        },
      ])
      .run()

    await publishScheduled(db)

    // Should have processed 2 past schedules
    const updated = await db.select().from(schema.schedules).all()
    const completed = updated.filter(s => s.status !== 'pending')
    expect(completed.length).toBeGreaterThanOrEqual(2)
  })

  it('does not re-publish already published schedules', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60)

    const schedules = await db
      .insert(schema.schedules)
      .values({
        userId: testUserId,
        contentId: 'already-published',
        scheduledAt: pastDate.toISOString(),
        status: 'published',
      })
      .returning()

    const result = await publishScheduled(db)

    // Should not have processed this one
    const updated = await db.select().from(schema.schedules).all()
    expect(updated[0].status).toBe('published')
  })
})
