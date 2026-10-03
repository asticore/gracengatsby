// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { getPasswordHash, setPasswordHash, clearPassword } from '@/cms/db/contentPasswords'

describe('contentPasswords data access', () => {
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

  it('stores and retrieves a password hash', async () => {
    const hash = '$2b$10$examplehash'
    await setPasswordHash(db, 'pages', 123, hash)
    const retrieved = await getPasswordHash(db, 'pages', 123)
    expect(retrieved).toBe(hash)
  })

  it('updates an existing password hash', async () => {
    const oldHash = '$2b$10$old'
    const newHash = '$2b$10$new'
    await setPasswordHash(db, 'posts', 456, oldHash)
    let retrieved = await getPasswordHash(db, 'posts', 456)
    expect(retrieved).toBe(oldHash)

    await setPasswordHash(db, 'posts', 456, newHash)
    retrieved = await getPasswordHash(db, 'posts', 456)
    expect(retrieved).toBe(newHash)
  })

  it('returns null for non-existent password', async () => {
    const result = await getPasswordHash(db, 'events', 999)
    expect(result).toBeNull()
  })

  it('clears a password', async () => {
    const hash = '$2b$10$example'
    await setPasswordHash(db, 'pages', 789, hash)
    let retrieved = await getPasswordHash(db, 'pages', 789)
    expect(retrieved).toBe(hash)

    await clearPassword(db, 'pages', 789)
    retrieved = await getPasswordHash(db, 'pages', 789)
    expect(retrieved).toBeNull()
  })

  it('isolates passwords by collection and docId', async () => {
    const hash1 = '$2b$10$hash1'
    const hash2 = '$2b$10$hash2'
    const hash3 = '$2b$10$hash3'

    await setPasswordHash(db, 'pages', 100, hash1)
    await setPasswordHash(db, 'posts', 100, hash2)
    await setPasswordHash(db, 'pages', 200, hash3)

    expect(await getPasswordHash(db, 'pages', 100)).toBe(hash1)
    expect(await getPasswordHash(db, 'posts', 100)).toBe(hash2)
    expect(await getPasswordHash(db, 'pages', 200)).toBe(hash3)
  })
})
