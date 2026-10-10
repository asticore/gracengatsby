import { describe, expect, it, vi } from 'vitest'
import { EDIT_PREFS_KEY, loadEditPrefs, sanitizeEditPrefs, saveEditPrefs } from '@/admin/editPrefs'
import type { Engine, TypedUser } from '@/engine'

describe('sanitizeEditPrefs', () => {
  it('accepts valid ids and keeps order', () => {
    expect(sanitizeEditPrefs({ closed: ['settings', 'panel:publish', 'outline:0.1.2'] })).toEqual({
      closed: ['settings', 'panel:publish', 'outline:0.1.2'],
    })
  })

  it('drops ids that do not match the pattern or are too long', () => {
    const result = sanitizeEditPrefs({
      closed: ['ok', 'has space', 'bad"quote', '<script>', 'x'.repeat(61), 'x'.repeat(60), '', 42, null],
    })
    expect(result.closed).toEqual(['ok', 'x'.repeat(60)])
  })

  it('removes duplicates', () => {
    expect(sanitizeEditPrefs({ closed: ['a', 'a', 'b'] }).closed).toEqual(['a', 'b'])
  })

  it('caps at 100 ids', () => {
    const closed = Array.from({ length: 150 }, (_, i) => `card-${i}`)
    const result = sanitizeEditPrefs({ closed })
    expect(result.closed).toHaveLength(100)
    expect(result.closed[0]).toBe('card-0')
    expect(result.closed[99]).toBe('card-99')
  })

  it('returns empty closed for non-array closed and non-object input', () => {
    expect(sanitizeEditPrefs({ closed: 'settings' })).toEqual({ closed: [] })
    expect(sanitizeEditPrefs({})).toEqual({ closed: [] })
    expect(sanitizeEditPrefs(null)).toEqual({ closed: [] })
    expect(sanitizeEditPrefs(undefined)).toEqual({ closed: [] })
    expect(sanitizeEditPrefs('string')).toEqual({ closed: [] })
    expect(sanitizeEditPrefs(42)).toEqual({ closed: [] })
  })

  it('drops unknown fields', () => {
    expect(sanitizeEditPrefs({ closed: ['a'], extra: 'x', cols: ['y'] } as never)).toEqual({ closed: ['a'] })
  })
})

describe('loadEditPrefs, saveEditPrefs', () => {
  const mockUser = { id: 42, email: 'user@example.com', roles: ['admin'] } as TypedUser

  function makeMockEngine(): Engine {
    return {
      find: vi.fn(async () => ({ docs: [] })),
      create: vi.fn(async (args: Record<string, unknown>) => ({
        id: 1,
        ...(args.data as Record<string, unknown>),
      })),
      update: vi.fn(async (args: Record<string, unknown>) => ({
        id: args.id,
        ...(args.data as Record<string, unknown>),
      })),
      delete: vi.fn(async () => ({ id: 1 })),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as Engine
  }

  it('EDIT_PREFS_KEY is the fixed preferences key', () => {
    expect(EDIT_PREFS_KEY).toBe('edit-screen-collapse')
  })

  it('loadEditPrefs returns empty when there is no user', async () => {
    const engine = makeMockEngine()
    expect(await loadEditPrefs(engine, null)).toEqual({ closed: [] })
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('loadEditPrefs queries by key with overrideAccess and returns empty when no row', async () => {
    const engine = makeMockEngine()
    expect(await loadEditPrefs(engine, mockUser)).toEqual({ closed: [] })
    expect(engine.find).toHaveBeenCalledWith({
      collection: 'preferences',
      where: { key: { equals: 'edit-screen-collapse' } },
      depth: 0,
      limit: 1000,
      pagination: false,
      user: mockUser,
      overrideAccess: true,
    })
  })

  it('loadEditPrefs returns only the rows owned by this user', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({
      docs: [
        { id: 1, key: EDIT_PREFS_KEY, user: [{ relationTo: 'users', value: 7 }], value: { closed: ['other'] } },
        { id: 2, key: EDIT_PREFS_KEY, user: [{ relationTo: 'users', value: 42 }], value: { closed: ['settings', 'bad id'] } },
      ],
    } as never)
    expect(await loadEditPrefs(engine, mockUser)).toEqual({ closed: ['settings'] })
  })

  it('loadEditPrefs returns empty on error', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockRejectedValueOnce(new Error('DB error'))
    expect(await loadEditPrefs(engine, mockUser)).toEqual({ closed: [] })
  })

  it('saveEditPrefs creates a row for a user with no existing prefs', async () => {
    const engine = makeMockEngine()
    const result = await saveEditPrefs(engine, mockUser, { closed: ['settings', 'access'] })
    expect(result).toEqual({ closed: ['settings', 'access'] })
    expect(engine.create).toHaveBeenCalledWith({
      collection: 'preferences',
      data: { key: 'edit-screen-collapse', user: [42], value: { closed: ['settings', 'access'] } },
      user: mockUser,
      overrideAccess: true,
    })
    expect(engine.update).not.toHaveBeenCalled()
  })

  it('saveEditPrefs updates the existing row for this user', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({
      docs: [{ id: 9, key: EDIT_PREFS_KEY, user: [{ relationTo: 'users', value: 42 }], value: { closed: ['old'] } }],
    } as never)
    const result = await saveEditPrefs(engine, mockUser, { closed: ['seo'] })
    expect(result).toEqual({ closed: ['seo'] })
    expect(engine.update).toHaveBeenCalledWith({
      collection: 'preferences',
      id: 9,
      data: { value: { closed: ['seo'] } },
      user: mockUser,
      overrideAccess: true,
    })
    expect(engine.create).not.toHaveBeenCalled()
  })

  it('saveEditPrefs sanitizes input before storing', async () => {
    const engine = makeMockEngine()
    const result = await saveEditPrefs(engine, mockUser, { closed: ['ok', 'no good!', 'ok'], view: 'list' })
    expect(result).toEqual({ closed: ['ok'] })
    expect(vi.mocked(engine.create).mock.calls[0][0]).toMatchObject({ data: { value: { closed: ['ok'] } } })
  })

  it('saveEditPrefs does nothing without a user', async () => {
    const engine = makeMockEngine()
    expect(await saveEditPrefs(engine, null, { closed: ['a'] })).toEqual({ closed: [] })
    expect(engine.create).not.toHaveBeenCalled()
  })
})
