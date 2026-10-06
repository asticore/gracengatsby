// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  PERMISSION_CATEGORIES,
  RESOURCES,
  can,
  effectiveMatrix,
  sanitizeOverrides,
  ALL_ACTIONS,
} from '@/features/roles/permissions'

describe('permissions-v2', () => {
  it('PERMISSION_CATEGORIES covers every RESOURCE exactly once', () => {
    const coveredResources = new Set<string>()
    for (const category of PERMISSION_CATEGORIES) {
      for (const row of category.rows) {
        expect(coveredResources, `${row.resource} should not be covered twice`).not.toContain(row.resource)
        coveredResources.add(row.resource)
      }
    }
    const uncovered = RESOURCES.filter((r) => !coveredResources.has(r))
    expect(uncovered, `All resources should be covered in PERMISSION_CATEGORIES`).toEqual([])
  })

  it('sanitizeOverrides drops unknown resources', () => {
    const input = {
      grant: {
        pages: { read: true },
        'unknown-resource': { read: true },
      } as Record<string, any>,
    }
    const result = sanitizeOverrides(input)
    expect(result.grant).toBeDefined()
    expect(result.grant!.pages).toBeDefined()
    const granted = result.grant as Record<string, any>
    expect(granted['unknown-resource']).toBeUndefined()
  })

  it('sanitizeOverrides drops unknown actions', () => {
    const input = {
      grant: {
        pages: { read: true, 'unknown-action': true } as Record<string, any>,
      },
    }
    const result = sanitizeOverrides(input)
    expect(result.grant!.pages!.read).toBe(true)
    const perms = result.grant!.pages as Record<string, any>
    expect(perms['unknown-action']).toBeUndefined()
  })

  it('sanitizeOverrides drops secret resources from grant', () => {
    const input = {
      grant: {
        'settings:integrations': { read: true },
        users: { read: true },
        pages: { read: true },
      } as Record<string, any>,
    }
    const result = sanitizeOverrides(input)
    const granted = result.grant as Record<string, any>
    expect(granted['settings:integrations']).toBeUndefined()
    expect(granted.users).toBeUndefined()
    expect(granted.pages).toBeDefined()
  })

  it('sanitizeOverrides handles invalid JSON in string', () => {
    const result = sanitizeOverrides('{ invalid json }')
    expect(result).toEqual({})
  })

  it('sanitizeOverrides handles null/undefined', () => {
    expect(sanitizeOverrides(null)).toEqual({})
    expect(sanitizeOverrides(undefined)).toEqual({})
  })

  it('can() with grant override allows action', () => {
    const user = {
      roles: ['customer'],
      permissionOverrides: {
        grant: {
          pages: { read: true },
        },
      },
    }
    expect(can(user, 'pages', 'read')).toBe(true)
  })

  it('can() with deny override blocks action', () => {
    const user = {
      roles: ['editor'],
      permissionOverrides: {
        deny: {
          pages: { delete: true },
        },
      },
    }
    // Editor has delete on pages by default
    expect(can(user, 'pages', 'delete', undefined)).toBe(false)
  })

  it('can() deny beats role grant', () => {
    const user = {
      roles: ['editor'],
      permissionOverrides: {
        deny: {
          posts: { update: true },
        },
      },
    }
    expect(can(user, 'posts', 'update')).toBe(false)
  })

  it('can() never grants secret resources to non-admin even with override', () => {
    const user = {
      roles: ['customer'],
      permissionOverrides: {
        grant: {
          'settings:integrations': { read: true },
        },
      },
    }
    expect(can(user, 'settings:integrations', 'read')).toBe(false)
  })

  it('can() with custom matrix honors it', () => {
    const user = { roles: ['viewer'] }
    const customMatrix = { products: { read: true, update: true } }
    expect(can(user, 'products', 'read', customMatrix)).toBe(true)
    expect(can(user, 'products', 'update', customMatrix)).toBe(true)
  })

  it('effectiveMatrix computes full permissions for non-admin', () => {
    const user = {
      roles: ['editor'],
      permissionOverrides: {
        grant: { products: { read: true } },
        deny: { posts: { delete: true } },
      },
    }
    const matrix = effectiveMatrix(user)
    expect(matrix.pages.delete).toBe(true) // editor default
    const postsPerms = matrix.posts as Record<string, any>
    expect(postsPerms.delete).toBeUndefined() // denied by override
    const productsPerms = matrix.products as Record<string, any>
    expect(productsPerms.read).toBe(true) // granted by override
  })

  it('editor has publish on pages, posts, events but not products by default', () => {
    const user = { roles: ['editor'] }
    expect(can(user, 'pages', 'publish')).toBe(true)
    expect(can(user, 'posts', 'publish')).toBe(true)
    expect(can(user, 'events', 'publish')).toBe(true)
    expect(can(user, 'products', 'publish')).toBe(false)
  })

  it('admin always has access except denied by secret check', () => {
    const user = { roles: ['admin'] }
    expect(can(user, 'pages', 'read')).toBe(true)
    expect(can(user, 'pages', 'delete')).toBe(true)
    expect(can(user, 'pages', 'publish')).toBe(true)
  })

  it('viewer has only read on specified resources', () => {
    const user = { roles: ['viewer'] }
    expect(can(user, 'pages', 'read')).toBe(true)
    expect(can(user, 'pages', 'create')).toBe(false)
    expect(can(user, 'pages', 'delete')).toBe(false)
  })

  it('sanitizeOverrides converts JSON string to object', () => {
    const json = JSON.stringify({
      grant: { pages: { read: true } },
    })
    const result = sanitizeOverrides(json)
    expect(result.grant!.pages!.read).toBe(true)
  })

  it('sanitizeOverrides preserves deny for all resources', () => {
    const input = {
      deny: {
        'settings:integrations': { read: true },
        pages: { delete: true },
      } as Record<string, any>,
    }
    const result = sanitizeOverrides(input)
    // Deny keeps secret resources (only grant is restricted)
    const denied = result.deny as Record<string, any>
    expect(denied['settings:integrations']).toBeDefined()
    expect(denied.pages).toBeDefined()
  })

  it('can() allows custom matrix without role matrix', () => {
    const user = { roles: ['customer'] }
    const customMatrix = { faqs: { read: true, create: true } }
    expect(can(user, 'faqs', 'read', customMatrix)).toBe(true)
    expect(can(user, 'faqs', 'create', customMatrix)).toBe(true)
  })

  it('publish action is part of ALL_ACTIONS', () => {
    expect(ALL_ACTIONS).toContain('publish')
    expect(ALL_ACTIONS).toContain('read')
    expect(ALL_ACTIONS).toContain('create')
    expect(ALL_ACTIONS).toContain('update')
    expect(ALL_ACTIONS).toContain('delete')
  })
})