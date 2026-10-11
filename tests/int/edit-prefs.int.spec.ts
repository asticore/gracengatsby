import { describe, expect, it, vi } from 'vitest'
import { EDIT_PREFS_KEY, loadEditPrefs, sanitizeEditPrefs, saveEditPrefs } from '@/admin/editPrefs'
import type { Engine, TypedUser } from '@/engine'

describe('sanitizeEditPrefs', () => {
  it('accepts valid ids and keeps order', () => {
    expect(sanitizeEditPrefs({ open: ['settings', 'panel:publish', 'outline:0.1.2'] })).toEqual({
      open: ['settings', 'panel:publish', 'outline:0.1.2'],
    })
  })

  it('drops ids that do not match the pattern or are too long', () => {
    const result = sanitizeEditPrefs({
      open: ['ok', 'has space', 'bad"quote', '<script>', 'x'.repeat(61), 'x'.repeat(60), '', 42, null],
    })
    expect(result.open).toEqual(['ok', 'x'.repeat(60)])
  })

  it('removes duplicates', () => {
    expect(sanitizeEditPrefs({ open: ['a', 'a', 'b'] }).open).toEqual(['a', 'b'])
  })

  it('caps at 100 ids', () => {
    const open = Array.from({ length: 150 }, (_, i) => `card-${i}`)
    const result = sanitizeEditPrefs({ open })
    expect(result.open).toHaveLength(100)
    expect(result.open[0]).toBe('card-0')
    expect(result.open[99]).toBe('card-99')
  })

  it('returns empty open for non-array open and non-object input', () => {
    expect(sanitizeEditPrefs({ open: 'settings' })).toEqual({ open: [] })
    expect(sanitizeEditPrefs({})).toEqual({ open: [] })
    expect(sanitizeEditPrefs(null)).toEqual({ open: [] })
    expect(sanitizeEditPrefs(undefined)).toEqual({ open: [] })
    expect(sanitizeEditPrefs('string')).toEqual({ open: [] })
    expect(sanitizeEditPrefs(42)).toEqual({ open: [] })
  })

  it('drops unknown fields', () => {
    expect(sanitizeEditPrefs({ open: ['a'], extra: 'x', cols: ['y'] } as never)).toEqual({ open: ['a'] })
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
    expect(EDIT_PREFS_KEY).toBe('edit-screen-open')
  })

  it('loadEditPrefs returns empty when there is no user', async () => {
    const engine = makeMockEngine()
    expect(await loadEditPrefs(engine, null)).toEqual({ open: [] })
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('loadEditPrefs queries by key with overrideAccess and returns empty when no row', async () => {
    const engine = makeMockEngine()
    expect(await loadEditPrefs(engine, mockUser)).toEqual({ open: [] })
    expect(engine.find).toHaveBeenCalledWith({
      collection: 'preferences',
      where: { key: { equals: 'edit-screen-open' } },
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
        { id: 1, key: EDIT_PREFS_KEY, user: [{ relationTo: 'users', value: 7 }], value: { open: ['other'] } },
        { id: 2, key: EDIT_PREFS_KEY, user: [{ relationTo: 'users', value: 42 }], value: { open: ['settings', 'bad id'] } },
      ],
    } as never)
    expect(await loadEditPrefs(engine, mockUser)).toEqual({ open: ['settings'] })
  })

  it('loadEditPrefs returns empty on error', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockRejectedValueOnce(new Error('DB error'))
    expect(await loadEditPrefs(engine, mockUser)).toEqual({ open: [] })
  })

  it('saveEditPrefs creates a row for a user with no existing prefs', async () => {
    const engine = makeMockEngine()
    const result = await saveEditPrefs(engine, mockUser, { open: ['settings', 'access'] })
    expect(result).toEqual({ open: ['settings', 'access'] })
    expect(engine.create).toHaveBeenCalledWith({
      collection: 'preferences',
      data: { key: 'edit-screen-open', user: [42], value: { open: ['settings', 'access'] } },
      user: mockUser,
      overrideAccess: true,
    })
    expect(engine.update).not.toHaveBeenCalled()
  })

  it('saveEditPrefs updates the existing row for this user', async () => {
    const engine = makeMockEngine()
    vi.mocked(engine.find).mockResolvedValueOnce({
      docs: [{ id: 9, key: EDIT_PREFS_KEY, user: [{ relationTo: 'users', value: 42 }], value: { open: ['old'] } }],
    } as never)
    const result = await saveEditPrefs(engine, mockUser, { open: ['seo'] })
    expect(result).toEqual({ open: ['seo'] })
    expect(engine.update).toHaveBeenCalledWith({
      collection: 'preferences',
      id: 9,
      data: { value: { open: ['seo'] } },
      user: mockUser,
      overrideAccess: true,
    })
    expect(engine.create).not.toHaveBeenCalled()
  })

  it('saveEditPrefs sanitizes input before storing', async () => {
    const engine = makeMockEngine()
    const result = await saveEditPrefs(engine, mockUser, { open: ['ok', 'no good!', 'ok'], view: 'list' })
    expect(result).toEqual({ open: ['ok'] })
    expect(vi.mocked(engine.create).mock.calls[0][0]).toMatchObject({ data: { value: { open: ['ok'] } } })
  })

  it('saveEditPrefs does nothing without a user', async () => {
    const engine = makeMockEngine()
    expect(await saveEditPrefs(engine, null, { open: ['a'] })).toEqual({ open: [] })
    expect(engine.create).not.toHaveBeenCalled()
  })
})
