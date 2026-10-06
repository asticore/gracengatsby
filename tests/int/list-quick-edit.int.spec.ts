import { describe, it, expect } from 'vitest'
import { buildQuickEditPatch, getDescendantIds, shouldShowRowActions, type QuickEditData } from '@/admin/list/quickEdit'

describe('buildQuickEditPatch', () => {
  it('builds patch with only changed fields', () => {
    const original: Record<string, unknown> = { id: 1, title: 'Original', slug: 'original', _status: 'published' }
    const edited: QuickEditData = { title: 'Updated', slug: 'original', _status: 'published' }

    const patch = buildQuickEditPatch(original, edited)

    expect(patch).toEqual({
      title: 'Updated',
      _status: 'published',
    })
  })

  it('includes _status even if unchanged', () => {
    const original: Record<string, unknown> = { id: 1, title: 'Test', _status: 'published' }
    const edited: QuickEditData = { title: 'Test', _status: 'published' }

    const patch = buildQuickEditPatch(original, edited)

    expect(patch).toEqual({ _status: 'published' })
  })

  it('includes parent field for pages', () => {
    const original: Record<string, unknown> = { id: 1, title: 'Page', parent: null }
    const edited: QuickEditData = { title: 'Page', parent: 5 }

    const patch = buildQuickEditPatch(original, edited)

    expect(patch).toEqual({ parent: 5 })
  })

  it('handles parent being set to null', () => {
    const original: Record<string, unknown> = { id: 1, title: 'Page', parent: 3 }
    const edited: QuickEditData = { title: 'Page', parent: null }

    const patch = buildQuickEditPatch(original, edited)

    expect(patch).toEqual({ parent: null })
  })

  it('skips fields that are undefined', () => {
    const original = { id: 1, title: 'Test' }
    const edited = { title: 'Test' }

    const patch = buildQuickEditPatch(original, edited)

    expect(patch).not.toHaveProperty('slug')
  })
})

describe('getDescendantIds', () => {
  it('finds all descendant pages', () => {
    const pages: Array<{ id: number; parent: number | null }> = [
      { id: 1, parent: null },
      { id: 2, parent: 1 },
      { id: 3, parent: 1 },
      { id: 4, parent: 2 },
      { id: 5, parent: null },
    ]

    const descendants = getDescendantIds(1, pages)

    expect(descendants).toEqual(new Set([2, 3, 4]))
  })

  it('handles empty page list', () => {
    const descendants = getDescendantIds(1, [])
    expect(descendants.size).toBe(0)
  })

  it('handles page with no descendants', () => {
    const pages: Array<{ id: number; parent: number | null }> = [
      { id: 1, parent: null },
      { id: 2, parent: 1 },
    ]

    const descendants = getDescendantIds(2, pages)
    expect(descendants.size).toBe(0)
  })

  it('handles nested descendants', () => {
    const pages: Array<{ id: number; parent: number | null }> = [
      { id: 1, parent: null },
      { id: 2, parent: 1 },
      { id: 3, parent: 2 },
      { id: 4, parent: 3 },
    ]

    const descendants = getDescendantIds(1, pages)
    expect(descendants).toEqual(new Set([2, 3, 4]))
  })

  it('works with string ids', () => {
    const pages: Array<{ id: string; parent: string | null }> = [
      { id: 'a', parent: null },
      { id: 'b', parent: 'a' },
      { id: 'c', parent: 'b' },
    ]

    const descendants = getDescendantIds('a', pages)
    expect(descendants).toEqual(new Set(['b', 'c']))
  })
})

describe('shouldShowRowActions', () => {
  it('shows actions for collections with drafts', () => {
    expect(shouldShowRowActions('pages', true)).toBe(true)
    expect(shouldShowRowActions('products', true)).toBe(true)
  })

  it('shows actions for drafts-enabled collections even without hasDrafts flag', () => {
    expect(shouldShowRowActions('pages', false)).toBe(true)
    expect(shouldShowRowActions('posts', false)).toBe(true)
    expect(shouldShowRowActions('products', false)).toBe(true)
    expect(shouldShowRowActions('events', false)).toBe(true)
    expect(shouldShowRowActions('courses', false)).toBe(true)
  })

  it('hides actions for non-drafts collections', () => {
    expect(shouldShowRowActions('users', false)).toBe(false)
    expect(shouldShowRowActions('redirects', false)).toBe(false)
  })
})
