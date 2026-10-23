import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }))
vi.mock('@/cms/db/connect', () => ({ getDb }))

import {
  excludeProtected,
  excludeProtectedAccess,
  getProtectedIds,
} from '@/features/visibility/excludeProtected'

const dbWith = (rows: { doc_id: number }[]) => ({ all: vi.fn().mockResolvedValue(rows) })

describe('getProtectedIds', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs a single query and returns numeric ids', async () => {
    const db = dbWith([{ doc_id: 2 }, { doc_id: 5 }])
    getDb.mockResolvedValue(db)
    const ids = await getProtectedIds('posts')
    expect([...ids]).toEqual([2, 5])
    expect(db.all).toHaveBeenCalledTimes(1)
  })
})

describe('excludeProtected', () => {
  beforeEach(() => vi.clearAllMocks())
  const docs = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('drops protected docs with one query for the whole list', async () => {
    const db = dbWith([{ doc_id: 2 }])
    getDb.mockResolvedValue(db)
    expect(await excludeProtected('posts', docs)).toEqual([{ id: 1 }, { id: 3 }])
    expect(db.all).toHaveBeenCalledTimes(1)
  })

  it('returns everything when nothing is protected', async () => {
    getDb.mockResolvedValue(dbWith([]))
    expect(await excludeProtected('pages', docs)).toEqual(docs)
  })

  it('fails closed when the lookup throws', async () => {
    getDb.mockRejectedValue(new Error('db down'))
    expect(await excludeProtected('posts', docs)).toEqual([])
  })
})

describe('excludeProtectedAccess', () => {
  beforeEach(() => vi.clearAllMocks())
  const published = { _status: { equals: 'published' } }
  const args = { req: { user: null } } as never

  it('leaves full access (admins) untouched without querying', async () => {
    const access = excludeProtectedAccess('posts', () => true)
    expect(await access(args)).toBe(true)
    expect(getDb).not.toHaveBeenCalled()
  })

  it('adds a not_in clause for restricted readers', async () => {
    getDb.mockResolvedValue(dbWith([{ doc_id: 7 }]))
    const access = excludeProtectedAccess('posts', () => published)
    expect(await access(args)).toEqual({ and: [published, { id: { not_in: [7] } }] })
  })

  it('keeps the base where when nothing is protected', async () => {
    getDb.mockResolvedValue(dbWith([]))
    const access = excludeProtectedAccess('pages', () => published)
    expect(await access(args)).toEqual(published)
  })

  it('denies restricted reads when the lookup fails', async () => {
    getDb.mockRejectedValue(new Error('db down'))
    const access = excludeProtectedAccess('pages', () => published)
    expect(await access(args)).toBe(false)
  })
})
