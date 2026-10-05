import { describe, it, expect } from 'vitest'
import { breadcrumbTitle } from '@/features/pagesTree/breadcrumb'

describe('breadcrumbTitle', () => {
  it('returns title for root page with no parent', () => {
    const page = { id: 1, title: 'About', parent: null as any }
    expect(breadcrumbTitle(page, {})).toBe('About')
  })

  it('builds breadcrumb for 2 levels', () => {
    const byId = {
      1: { title: 'Home', parent: null as any },
      2: { title: 'About', parent: 1 },
    }
    const page = { id: 2, title: 'About', parent: 1 }
    expect(breadcrumbTitle(page, byId)).toBe('Home / About')
  })

  it('guards against cycles', () => {
    const byId = {
      1: { id: 1, title: 'A', parent: 2 },
      2: { id: 2, title: 'B', parent: 1 },
    }
    const page = { id: 1, title: 'A', parent: 2 }
    expect(breadcrumbTitle(page, byId)).toBe('B / A')
  })

  it('handles missing parent gracefully', () => {
    const byId = {
      1: { title: 'Child', parent: 999 },
    }
    const page = { id: 1, title: 'Child', parent: 999 }
    expect(breadcrumbTitle(page, byId)).toBe('Child')
  })

  it('respects max depth of 8', () => {
    const byId: Record<number, { title: string; parent: number | null }> = {}
    for (let i = 1; i <= 10; i++) {
      byId[i] = { title: `Level${i}`, parent: i === 1 ? null : i - 1 }
    }
    const page = { id: 10, title: 'Level10', parent: 9 }
    // Only 8 levels max: Level3/Level4/.../Level10
    const result = breadcrumbTitle(page, byId)
    const parts = result.split(' / ')
    expect(parts.length).toBeLessThanOrEqual(8)
  })
})
