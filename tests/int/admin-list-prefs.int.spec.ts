import { describe, expect, it, vi } from 'vitest'
import { loadListPrefs, prefsKey, resetListPrefs, sanitizeListPrefs, saveListPrefs } from '@/admin/list/listPrefs'
import type { Engine, TypedUser } from '@/engine'

describe('sanitizeListPrefs', () => {
  it('accepts valid ListPrefs', () => {
    const input = {
      cols: ['id', 'title', 'createdAt'],
      sort: '-updatedAt',
      limit: 50,
      view: 'list',
    }
    const result = sanitizeListPrefs(input)
    expect(result).toEqual(input)
  })

  it('caps cols to 30 items', () => {
    const cols = Array.from({ length: 40 }, (_, i) => `col${i}`)
    const result = sanitizeListPrefs({ cols })
    expect(result.cols).toHaveLength(30)
  })

  it('filters invalid col names', () => {
    const result = sanitizeListPrefs({
      cols: ['valid', 'col_nested', 'col.nested', 'invalid@char', 'drop me'],
    })
    expect(result.cols).toEqual(['valid', 'col_nested', 'col.nested'])
  })

  it('accepts sort with leading minus', () => {
    const result = sanitizeListPrefs({ sort: '-createdAt' })
    expect(result.sort).toBe('-createdAt')
  })

  it('rejects invalid sort pattern', () => {
    const result = sanitizeListPrefs({ sort: 'invalid@sort' })
    expect(result.sort).toBeUndefined()
  })

  it('accepts valid limit values', () => {
    expect(sanitizeListPrefs({ limit: 10 }).limit).toBe(10)
    expect(sanitizeListPrefs({ limit: 25 }).limit).toBe(25)
    expect(sanitizeListPrefs({ limit: 50 }).limit).toBe(50)
    expect(sanitizeListPrefs({ limit: 100 }).limit).toBe(100)
  })

  it('rejects invalid limit', () => {
    const result = sanitizeListPrefs({ limit: 75 })
    expect(result.limit).toBeUndefined()
  })

  it('accepts valid view values', () => {
    expect(sanitizeListPrefs({ view: 'list' }).view).toBe('list')
    expect(sanitizeListPrefs({ view: 'gallery' }).view).toBe('gallery')
    expect(sanitizeListPrefs({ view: 'calendar' }).view).toBe('calendar')
    expect(sanitizeListPrefs({ view: 'tree' }).view).toBe('tree')
  })

  it('rejects invalid view', () => {
    const result = sanitizeListPrefs({ view: 'invalid' })
    expect(result.view).toBeUndefined()
  })

  it('handles null and non-object input', () => {
    expect(sanitizeListPrefs(null)).toEqual({})
    expect(sanitizeListPrefs(undefined)).toEqual({})
    expect(sanitizeListPrefs('string')).toEqual({})
    expect(sanitizeListPrefs(42)).toEqual({})
  })

  it('drops unknown fields', () => {
    const result = sanitizeListPrefs({
      cols: ['id'],
      unknownField: 'value',
      anotherUnknown: 123,
    } as never)
    expect(result).toEqual({ cols: ['id'] })
  })

  it('handles injection-looking strings in cols', () => {
    const result = sanitizeListPrefs({
      cols: ['id"; DROP TABLE--', 'id\'; DELETE FROM', 'id[0]', 'id<script>'],
    })
    // Empty col array is dropped, so cols should be undefined
    expect(result.cols).toBeUndefined()
  })

  it('merges partial prefs', () => {
    const result = sanitizeListPrefs({ view: 'gallery' })
    expect(result).toEqual({ view: 'gallery' })
    expect(result.cols).toBeUndefined()
    expect(result.sort).toBeUndefined()
  })
})

describe('prefsKey', () => {
  it('generates key in correct format', () => {
    expect(prefsKey('posts')).toBe('collection-posts-list')
    expect(prefsKey('events')).toBe('collection-events-list')
  })

  it('handles complex slugs', () => {
    expect(prefsKey('form-submissions')).toBe('collection-form-submissions-list')
    expect(prefsKey('my_collection')).toBe('collection-my_collection-list')
  })
})

describe('loadListPrefs, saveListPrefs, resetListPrefs', () => {
  const mockUser = { id: 42, email: 'user@example.com', roles: ['admin'] } as TypedUser
  const collectionSlug = 'posts'

  function makeMockEngine(): Engine {
    return {
      find: vi.fn(async () => ({ docs: [] })),
      findByID: vi.fn(async () => null),
      create: vi.fn(async (args: Record<string, unknown>) => ({
        id: 1,
        ...(args.data as Record<string, unknown>),
      })),
      update: vi.fn(async (args: Record<string, unknown>) => ({
        id: args.id,
        ...(args.data as Record<string, unknown>),
      })),
      delete: vi.fn(async () => ({ id: 1 })),
      count: vi.fn(async () => 0),
      auth: vi.fn(),
      getCollectionConfig: vi.fn(),
      findGlobal: vi.fn(),
      updateGlobal: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      config: { routes: { admin: '', api: '' }, serverURL: '' },
      collections: {},
      db: { migrate: vi.fn() },
    } as unknown as Engine
  }

  it('loadListPrefs returns empty object when no user', async () => {
    const engine = makeMockEngine()
    const result = await loadListPrefs(engine, null, collectionSlug)
    expect(result).toEqual({})
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('loadListPrefs returns empty object when doc not found', async () => {
    const engine = makeMockEngine()
    const result = await loadListPrefs(engine, mockUser, collectionSlug)
    expect(result).toEqual({})
    expect(engine.find).toHaveBeenCalledWith({
      collection: 'preferences',
      where: { key: { equals: 'collection-posts-list' }, user: { equals: 42 } },
      depth: 0,
      user: mockUser,
      overrideAccess: true,
    })
  })

  it('loadListPrefs scopes find by user id in where clause', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({
      docs: [{ id: 1, key: 'collection-posts-list', user: 42, value: { view: 'gallery' } }],
    } as never)

    await loadListPrefs(engine, mockUser, collectionSlug)

    const call = vi.mocked(engine.find).mock.calls[0][0] as Record<string, unknown>
    // Verify user scoping
    expect(((call.where as Record<string, unknown>).user as Record<string, unknown>).equals).toBe(42)
  })

  it('loadListPrefs returns sanitized value from doc', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({
      docs: [
        {
          id: 1,
          key: 'collection-posts-list',
          user: 42,
          value: { cols: ['id', 'title'], sort: '-createdAt', limit: 25, view: 'list', unknownField: 'drop' },
        },
      ],
    } as never)

    const result = await loadListPrefs(engine, mockUser, collectionSlug)
    expect(result).toEqual({
      cols: ['id', 'title'],
      sort: '-createdAt',
      limit: 25,
      view: 'list',
    })
  })

  it('loadListPrefs returns empty object on error', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockRejectedValueOnce(new Error('DB error'))

    const result = await loadListPrefs(engine, mockUser, collectionSlug)
    expect(result).toEqual({})
  })

  it('saveListPrefs returns empty object when no user', async () => {
    const engine = makeMockEngine()
    const result = await saveListPrefs(engine, null, collectionSlug, { view: 'gallery' })
    expect(result).toEqual({})
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('saveListPrefs creates new doc when not found', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({ docs: [] } as never)

    const prefs = { view: 'gallery', cols: ['id', 'title'] }
    const result = await saveListPrefs(engine, mockUser, collectionSlug, prefs)

    const createCall = vi.mocked(engine.create).mock.calls[0][0] as Record<string, unknown>
    expect(createCall.collection).toBe('preferences')
    expect((createCall.data as Record<string, unknown>).key).toBe('collection-posts-list')
    expect((createCall.data as Record<string, unknown>).user).toBe(42)
    expect(result).toEqual(prefs)
  })

  it('saveListPrefs merges with existing doc', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({
      docs: [{ id: 10, key: 'collection-posts-list', user: 42, value: { cols: ['id', 'title'], limit: 50 } }],
    } as never)

    const newPrefs = { view: 'gallery' }
    const result = await saveListPrefs(engine, mockUser, collectionSlug, newPrefs)

    expect(engine.update).toHaveBeenCalledWith({
      collection: 'preferences',
      id: 10,
      data: {
        value: {
          cols: ['id', 'title'],
          limit: 50,
          view: 'gallery',
        },
      },
      user: mockUser,
      overrideAccess: true,
    })
    expect(result).toEqual({ cols: ['id', 'title'], limit: 50, view: 'gallery' })
  })

  it('saveListPrefs sanitizes input', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({ docs: [] } as never)

    const dirtyPrefs = {
      cols: ['id', 'invalid@col', 'title'],
      sort: 'invalid@sort',
      limit: 75,
      view: 'invalid',
    }
    await saveListPrefs(engine, mockUser, collectionSlug, dirtyPrefs)

    const createCall = vi.mocked(engine.create).mock.calls[0][0] as Record<string, unknown>
    const savedValue = (createCall.data as Record<string, unknown>).value as Record<string, unknown>
    expect(savedValue.cols).toEqual(['id', 'title'])
    expect(savedValue.sort).toBeUndefined()
    expect(savedValue.limit).toBeUndefined()
    expect(savedValue.view).toBeUndefined()
  })

  it('saveListPrefs scopes by user id in where clause', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({ docs: [] } as never)

    await saveListPrefs(engine, mockUser, collectionSlug, { view: 'list' })

    const findCall = vi.mocked(engine.find).mock.calls[0][0] as Record<string, unknown>
    expect(((findCall.where as Record<string, unknown>).user as Record<string, unknown>).equals).toBe(42)
  })

  it('resetListPrefs returns void when no user', async () => {
    const engine = makeMockEngine()
    await resetListPrefs(engine, null, collectionSlug)
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('resetListPrefs deletes the preferences doc', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({
      docs: [{ id: 10, key: 'collection-posts-list', user: 42 }],
    } as never)

    await resetListPrefs(engine, mockUser, collectionSlug)

    expect(engine.delete).toHaveBeenCalledWith({
      collection: 'preferences',
      id: 10,
      user: mockUser,
      overrideAccess: true,
    })
  })

  it('resetListPrefs handles missing doc gracefully', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({ docs: [] } as never)

    await resetListPrefs(engine, mockUser, collectionSlug)

    expect(engine.delete).not.toHaveBeenCalled()
  })

  it('resetListPrefs scopes by user id in where clause', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({ docs: [] } as never)

    await resetListPrefs(engine, mockUser, collectionSlug)

    const findCall = vi.mocked(engine.find).mock.calls[0][0] as Record<string, unknown>
    expect(((findCall.where as Record<string, unknown>).user as Record<string, unknown>).equals).toBe(42)
  })

  it('saveListPrefs returns sanitized input on error', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockRejectedValueOnce(new Error('DB error'))

    const result = await saveListPrefs(engine, mockUser, collectionSlug, { view: 'gallery' })

    expect(result).toEqual({ view: 'gallery' })
  })

  it('resetListPrefs ignores errors silently', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockRejectedValueOnce(new Error('DB error'))

    // Should not throw
    await resetListPrefs(engine, mockUser, collectionSlug)
    expect(engine.delete).not.toHaveBeenCalled()
  })
})
