import { describe, it, expect } from 'vitest'
import type { PermissionMatrix, PermissionOverrides, Resource, Action } from '@/features/roles/permissions'
import {
  toggleCategory,
  toggleColumn,
  cycleTriState,
  getCategoryActionCount,
  filterBySearch,
  setOverrideState,
  getResourcesInCategory,
} from '@/features/roles/permissionTable'
import { PERMISSION_CATEGORIES } from '@/features/roles/permissions'

describe('permissionTable helpers', () => {
  describe('getResourcesInCategory', () => {
    it('returns resources for a known category', () => {
      const resources = getResourcesInCategory('content')
      expect(resources.length).toBeGreaterThan(0)
      expect(resources).toContain('pages')
      expect(resources).toContain('posts')
    })

    it('returns empty array for unknown category', () => {
      const resources = getResourcesInCategory('unknown')
      expect(resources).toEqual([])
    })
  })

  describe('toggleCategory', () => {
    it('enables all resources in a category', () => {
      const matrix: Partial<PermissionMatrix> = {}
      const result = toggleCategory(matrix, 'content', 'read', true)
      expect(result.pages?.read).toBe(true)
      expect(result.posts?.read).toBe(true)
    })

    it('disables all resources in a category', () => {
      const matrix: Partial<PermissionMatrix> = {
        pages: { read: true },
        posts: { read: true },
      }
      const result = toggleCategory(matrix, 'content', 'read', false)
      expect(result.pages?.read).toBe(false)
      expect(result.posts?.read).toBe(false)
    })
  })

  describe('toggleColumn', () => {
    it('toggles a column across all categories', () => {
      const matrix: Partial<PermissionMatrix> = {}
      const result = toggleColumn(matrix, 'read', true)
      // Should enable read for all resources
      expect(result.pages?.read).toBe(true)
      expect(result.media?.read).toBe(true)
      expect(result.products?.read).toBe(true)
    })
  })

  describe('cycleTriState', () => {
    it('cycles undefined to true', () => {
      expect(cycleTriState(undefined)).toBe(true)
    })

    it('cycles true to false', () => {
      expect(cycleTriState(true)).toBe(false)
    })

    it('cycles false to undefined', () => {
      expect(cycleTriState(false)).toBeUndefined()
    })
  })

  describe('getCategoryActionCount', () => {
    it('counts enabled permissions in a category', () => {
      const matrix: Partial<PermissionMatrix> = {
        pages: { read: true },
        posts: { read: true },
        events: { read: true },
      }
      const result = getCategoryActionCount(matrix, 'content', 'read')
      expect(result.enabled).toBeGreaterThanOrEqual(3)
      expect(result.total).toBeGreaterThan(0)
    })

    it('returns 0 for empty matrix', () => {
      const matrix: Partial<PermissionMatrix> = {}
      const result = getCategoryActionCount(matrix, 'content', 'read')
      expect(result.enabled).toBe(0)
    })
  })

  describe('filterBySearch', () => {
    it('returns all categories on empty search', () => {
      const result = filterBySearch('')
      expect(result.length).toBe(PERMISSION_CATEGORIES.length)
    })

    it('filters categories by row label', () => {
      const result = filterBySearch('pages')
      expect(result.length).toBeGreaterThan(0)
      const pages = result.flatMap(c => c.rows).find(r => r.label === 'Pages')
      expect(pages).toBeDefined()
    })

    it('filters by resource name', () => {
      const result = filterBySearch('users')
      const userCat = result.find(c => c.rows.some(r => r.resource === 'users'))
      expect(userCat).toBeDefined()
    })

    it('returns empty on no matches', () => {
      const result = filterBySearch('zzzzz_nonexistent')
      expect(result.length).toBe(0)
    })
  })

  describe('setOverrideState', () => {
    it('sets allow state', () => {
      const overrides: PermissionOverrides = {}
      const result = setOverrideState(overrides, 'pages', 'read', 'allow')
      expect(result.grant?.pages?.read).toBe(true)
      expect(result.deny?.pages?.read).toBeUndefined()
    })

    it('sets deny state', () => {
      const overrides: PermissionOverrides = {}
      const result = setOverrideState(overrides, 'pages', 'read', 'deny')
      expect(result.deny?.pages?.read).toBe(true)
      expect(result.grant?.pages?.read).toBeUndefined()
    })

    it('clears state on inherit', () => {
      const overrides: PermissionOverrides = {
        grant: { pages: { read: true } },
      }
      const result = setOverrideState(overrides, 'pages', 'read', 'inherit')
      expect(result.grant?.pages?.read).toBeUndefined()
      expect(result.deny?.pages?.read).toBeUndefined()
    })

    it('cleans up empty matrices', () => {
      const overrides: PermissionOverrides = {
        grant: { pages: { read: true } },
      }
      const result = setOverrideState(overrides, 'pages', 'read', 'inherit')
      // Should not have empty grant object
      expect(result.grant).toBeUndefined()
    })

    it('switches between states', () => {
      let overrides: PermissionOverrides = {}
      overrides = setOverrideState(overrides, 'pages', 'read', 'allow')
      expect(overrides.grant?.pages?.read).toBe(true)

      overrides = setOverrideState(overrides, 'pages', 'read', 'deny')
      expect(overrides.grant?.pages?.read).toBeUndefined()
      expect(overrides.deny?.pages?.read).toBe(true)

      overrides = setOverrideState(overrides, 'pages', 'read', 'inherit')
      expect(overrides.grant).toBeUndefined()
      expect(overrides.deny).toBeUndefined()
    })
  })
})
