// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { acquire, heartbeat, getLock, release, takeOver, type UserInfo } from '@/cms/db/editLocks'

describe('editLocks data access', () => {
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

  it('acquires a lock for a new document', async () => {
    const user: UserInfo = { userId: 1, label: 'alice' }
    const result = await acquire(db, 'pages', 100, user)
    expect(result).toEqual({ held: true })
  })

  it('prevents acquisition by a different user when lock is held', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user1: UserInfo = { userId: 1, label: 'alice' }
    const user2: UserInfo = { userId: 2, label: 'bob' }

    await acquire(db, 'pages', 200, user1)
    const result = await acquire(db, 'pages', 200, user2)
    expect(result).toEqual({ held: false, by: { userId: 1, label: 'alice' } })
  })

  it('allows the same user to re-acquire and refresh heartbeat', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user: UserInfo = { userId: 1, label: 'alice' }

    const first = await acquire(db, 'pages', 300, user)
    expect(first).toEqual({ held: true })

    const second = await acquire(db, 'pages', 300, user)
    expect(second).toEqual({ held: true })
  })

  it('breaks stale locks (60s without heartbeat)', async () => {
    // Use the proxy's raw D1 binding for raw SQL
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user1: UserInfo = { userId: 1, label: 'alice' }
    const user2: UserInfo = { userId: 2, label: 'bob' }

    // Acquire lock as user1
    await acquire(db, 'pages', 400, user1)

    // Simulate stale heartbeat by setting it to 70 seconds ago
    const staleTimestamp = Math.floor(Date.now() / 1000) - 70
    await proxy.env.D1.prepare(
      `UPDATE \`eg_edit_locks\` SET heartbeat_at = ? WHERE collection = 'pages' AND doc_id = 400`
    ).bind(staleTimestamp).run()

    // User2 should be able to take over
    const result = await acquire(db, 'pages', 400, user2)
    expect(result).toEqual({ held: true })

    // Verify lock is now held by user2
    const lock = await getLock(db, 'pages', 400)
    expect(lock).toEqual({ userId: 2, label: 'bob' })
  })

  it('getLock returns the current lock holder', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user: UserInfo = { userId: 5, label: 'charlie' }

    let lock = await getLock(db, 'pages', 500)
    expect(lock).toBeNull()

    await acquire(db, 'pages', 500, user)
    lock = await getLock(db, 'pages', 500)
    expect(lock).toEqual({ userId: 5, label: 'charlie' })
  })

  it('release removes the lock if held by the correct user', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user: UserInfo = { userId: 1, label: 'alice' }

    await acquire(db, 'pages', 600, user)
    let lock = await getLock(db, 'pages', 600)
    expect(lock).not.toBeNull()

    await release(db, 'pages', 600, 1)
    lock = await getLock(db, 'pages', 600)
    expect(lock).toBeNull()
  })

  it('release does nothing if wrong user tries to release', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user1: UserInfo = { userId: 1, label: 'alice' }

    await acquire(db, 'pages', 700, user1)
    await release(db, 'pages', 700, 999) // Wrong user
    const lock = await getLock(db, 'pages', 700)
    expect(lock?.userId).toBe(1) // Still held by user1
  })

  it('takeOver forces a new lock holder', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user1: UserInfo = { userId: 1, label: 'alice' }
    const user2: UserInfo = { userId: 2, label: 'bob' }

    await acquire(db, 'pages', 800, user1)
    await takeOver(db, 'pages', 800, user2)

    const lock = await getLock(db, 'pages', 800)
    expect(lock).toEqual({ userId: 2, label: 'bob' })
  })

  it('heartbeat refreshes the heartbeat timestamp for the current holder', async () => {
    await (db as any).run(`DELETE FROM \`eg_edit_locks\``)
    const user: UserInfo = { userId: 1, label: 'alice' }

    await acquire(db, 'pages', 900, user)
    const result = await heartbeat(db, 'pages', 900, user)
    expect(result).toEqual({ held: true })
  })

  it('heartbeat rejects if a different user holds the lock', async () => {
    await (db as any).run(`DELETE FROM \`eg_edit_locks\``)
    const user1: UserInfo = { userId: 1, label: 'alice' }
    const user2: UserInfo = { userId: 2, label: 'bob' }

    await acquire(db, 'pages', 1000, user1)
    const result = await heartbeat(db, 'pages', 1000, user2)
    expect(result.held).toBe(false)
    expect(result).toEqual({ held: false, by: { userId: 1, label: 'alice' } })
  })

  it('isolates locks by collection and docId', async () => {
    await proxy.env.D1.prepare(`DELETE FROM \`eg_edit_locks\``).run()
    const user1: UserInfo = { userId: 1, label: 'alice' }
    const user2: UserInfo = { userId: 2, label: 'bob' }
    const user3: UserInfo = { userId: 3, label: 'charlie' }

    await acquire(db, 'pages', 1100, user1)
    await acquire(db, 'posts', 1100, user2)
    await acquire(db, 'pages', 1200, user3)

    expect(await getLock(db, 'pages', 1100)).toEqual({ userId: 1, label: 'alice' })
    expect(await getLock(db, 'posts', 1100)).toEqual({ userId: 2, label: 'bob' })
    expect(await getLock(db, 'pages', 1200)).toEqual({ userId: 3, label: 'charlie' })
  })
})
