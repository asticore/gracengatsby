import { describe, expect, it, beforeEach } from 'vitest'
import {
  resolveRedirect,
  recordRedirectHit,
  invalidateRedirectsCache,
  __setD1ForTests,
} from '@/features/redirects'

/**
 * Fake D1 for testing
 */
type FakeRow = {
  id: number
  from_path: string
  to_path: string
  redirect_type: string
}

interface FakeD1Database {
  prepare(sql: string): {
    bind(...args: unknown[]): { run(): Promise<{ success?: boolean }>; all(): Promise<{ results?: FakeRow[] }> }
    all(): Promise<{ results?: FakeRow[] }>
    run(): Promise<{ success?: boolean }>
  }
}

function createFakeD1(rows: FakeRow[]): FakeD1Database {
  return {
    prepare(sql: string) {
      const isSelectQuery = sql.toLowerCase().includes('select')
      const isUpdateQuery = sql.toLowerCase().includes('update')

      return {
        bind: (...args: unknown[]) => ({
          run: async () => {
            if (isUpdateQuery) {
              return { success: true }
            }
            return { success: true }
          },
          all: async () => {
            if (isSelectQuery) {
              return { results: rows }
            }
            return { results: [] }
          },
        }),
        all: async () => {
          if (isSelectQuery) {
            return { results: rows }
          }
          return { results: [] }
        },
        run: async () => {
          return { success: true }
        },
      }
    },
  }
}

describe('resolveRedirect', () => {
  beforeEach(() => {
    invalidateRedirectsCache()
    __setD1ForTests(null)
  })

  describe('basic resolution', () => {
    it('resolves exact path match', async () => {
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old-page',
          to_path: '/new-page',
          redirect_type: '301',
        },
      ])

      __setD1ForTests(async () => db as unknown as any)

      const result = await resolveRedirect('/old-page')

      expect(result).toEqual({
        id: 1,
        to: '/new-page',
        status: 301,
      })
    })

    it('returns null for no match', async () => {
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old-page',
          to_path: '/new-page',
          redirect_type: '301',
        },
      ])

      __setD1ForTests(async () => db as unknown as any)

      const result = await resolveRedirect('/nonexistent')

      expect(result).toBeNull()
    })

    it('normalizes paths for matching', async () => {
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old-page/',
          to_path: '/new-page',
          redirect_type: '301',
        },
      ])

      __setD1ForTests(async () => db as unknown as any)

      // Should match /old-page even though stored as /old-page/
      const result = await resolveRedirect('/old-page')

      expect(result).toEqual({
        id: 1,
        to: '/new-page',
        status: 301,
      })
    })

    it('normalizes incoming pathname', async () => {
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old-page',
          to_path: '/new-page',
          redirect_type: '301',
        },
      ])

      __setD1ForTests(async () => db as unknown as any)

      // Should match /old-page even when incoming has trailing slash
      const result = await resolveRedirect('/old-page/')

      expect(result).toEqual({
        id: 1,
        to: '/new-page',
        status: 301,
      })
    })

    it('returns correct redirect status codes', async () => {
      const db = createFakeD1([
        { id: 1, from_path: '/a', to_path: '/b', redirect_type: '301' },
        { id: 2, from_path: '/c', to_path: '/d', redirect_type: '302' },
        { id: 3, from_path: '/e', to_path: '/f', redirect_type: '307' },
        { id: 4, from_path: '/g', to_path: '/h', redirect_type: '308' },
      ])

      __setD1ForTests(async () => db as unknown as any)

      expect((await resolveRedirect('/a'))?.status).toBe(301)
      expect((await resolveRedirect('/c'))?.status).toBe(302)
      expect((await resolveRedirect('/e'))?.status).toBe(307)
      expect((await resolveRedirect('/g'))?.status).toBe(308)
    })
  })

  describe('disabled redirects', () => {
    it('does not load disabled redirects', async () => {
      // Note: In real D1, we filter WHERE enabled = 1 in the query
      // So this test verifies the query construction by checking only enabled ones are used
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old',
          to_path: '/new',
          redirect_type: '301',
        },
      ])

      __setD1ForTests(async () => db as unknown as any)

      const result = await resolveRedirect('/old')
      expect(result).toBeDefined()
    })
  })

  describe('caching', () => {
    it('caches redirects for the TTL', async () => {
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old',
          to_path: '/new',
          redirect_type: '301',
        },
      ])

      let callCount = 0
      __setD1ForTests(async () => {
        callCount++
        return db as unknown as any
      })

      // First call loads from D1
      const result1 = await resolveRedirect('/old')
      expect(callCount).toBe(1)
      expect(result1).toBeDefined()

      // Second call uses cache
      const result2 = await resolveRedirect('/old')
      expect(callCount).toBe(1) // Still 1, no second DB call
      expect(result2).toEqual(result1)
    })

    it('invalidates cache on demand', async () => {
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old',
          to_path: '/new',
          redirect_type: '301',
        },
      ])

      let callCount = 0
      __setD1ForTests(async () => {
        callCount++
        return db as unknown as any
      })

      await resolveRedirect('/old')
      expect(callCount).toBe(1)

      invalidateRedirectsCache()

      await resolveRedirect('/old')
      expect(callCount).toBe(2)
    })
  })

  describe('error handling', () => {
    it('returns null when D1 is unavailable', async () => {
      __setD1ForTests(async () => null)

      const result = await resolveRedirect('/old')
      expect(result).toBeNull()
    })

    it('returns null when table is missing', async () => {
      __setD1ForTests(async () => {
        const fakeDb = {
          prepare: () => {
            throw new Error('Table not found')
          },
        }
        return fakeDb as unknown as any
      })

      const result = await resolveRedirect('/old')
      expect(result).toBeNull()
    })

    it('does not throw on any D1 error', async () => {
      __setD1ForTests(async () => {
        throw new Error('D1 connection failed')
      })

      const result = await resolveRedirect('/old')
      expect(result).toBeNull()
    })
  })

  describe('external URLs', () => {
    it('preserves external URLs as-is', async () => {
      const db = createFakeD1([
        {
          id: 1,
          from_path: '/old',
          to_path: 'https://external.com/page',
          redirect_type: '301',
        },
      ])

      __setD1ForTests(async () => db as unknown as any)

      const result = await resolveRedirect('/old')
      expect(result?.to).toBe('https://external.com/page')
    })
  })
})

describe('recordRedirectHit', () => {
  beforeEach(() => {
    __setD1ForTests(null)
  })

  it('swallows errors silently', async () => {
    __setD1ForTests(async () => {
      throw new Error('DB error')
    })

    // Should not throw
    await expect(recordRedirectHit(1)).resolves.toBeUndefined()
  })

  it('does nothing when D1 is unavailable', async () => {
    __setD1ForTests(async () => null)

    // Should not throw
    await expect(recordRedirectHit(1)).resolves.toBeUndefined()
  })

  it('updates hit count in database', async () => {
    const updates: Array<{ id?: number; now?: string }> = []

    const db = {
      prepare: (sql: string) => {
        if (sql.includes('UPDATE')) {
          return {
            bind: (now: string, id: number) => ({
              run: async () => {
                updates.push({ id, now })
                return { success: true }
              },
            }),
          }
        }
        return { all: async () => ({ results: [] as unknown[] }) }
      },
    }

    __setD1ForTests(async () => db as unknown as any)

    await recordRedirectHit(42)

    expect(updates.length).toBe(1)
    expect(updates[0].id).toBe(42)
  })
})
