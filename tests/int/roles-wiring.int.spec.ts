import { describe, expect, it, beforeAll } from 'vitest'
import { getEngine, type Engine } from '@/lib/engine'
import { buildCollectionPermissions, hasAdminPanelAccess } from '@/admin/auth'
import { can } from '@/features/roles/permissions'

describe('roles-wiring', () => {
  let engine: Engine

  beforeAll(async () => {
    engine = await getEngine()
  })

  describe('hasAdminPanelAccess', () => {
    it('allows admin users', () => {
      const adminUser = { roles: ['admin'] }
      expect(hasAdminPanelAccess(adminUser)).toBe(true)
    })

    it('allows editor users', () => {
      const editorUser = { roles: ['editor'] }
      expect(hasAdminPanelAccess(editorUser)).toBe(true)
    })

    it('allows viewer users', () => {
      const viewerUser = { roles: ['viewer'] }
      expect(hasAdminPanelAccess(viewerUser)).toBe(true)
    })

    it('denies customer users', () => {
      const customerUser = { roles: ['customer'] }
      expect(hasAdminPanelAccess(customerUser)).toBe(false)
    })

    it('denies users without roles', () => {
      expect(hasAdminPanelAccess(null)).toBe(false)
      expect(hasAdminPanelAccess({})).toBe(false)
      expect(hasAdminPanelAccess(undefined)).toBe(false)
    })
  })

  describe('buildCollectionPermissions', () => {
    it('admin has all permissions for pages collection', async () => {
      const adminUser = { id: 1, roles: ['admin'] }
      const collection = (engine.config.collections as unknown as Array<{ slug: string }>).find((c) => c.slug === 'pages')
      if (!collection) {
        throw new Error('pages collection not found')
      }

      const perms = await buildCollectionPermissions(collection as any, adminUser, engine)
      expect(perms.read).toBe(true)
      expect(perms.create).toBe(true)
      expect(perms.update).toBe(true)
      expect(perms.delete).toBe(true)
    })

    it('includes update and delete in permission object shape', async () => {
      const adminUser = { id: 1, roles: ['admin'] }
      const collection = (engine.config.collections as unknown as Array<{ slug: string }>).find((c) => c.slug === 'posts')
      if (!collection) {
        throw new Error('posts collection not found')
      }

      const perms = await buildCollectionPermissions(collection as any, adminUser, engine)
      expect(perms).toHaveProperty('read')
      expect(perms).toHaveProperty('create')
      expect(perms).toHaveProperty('update')
      expect(perms).toHaveProperty('delete')
    })

    it('respects collection access functions for read/create/update/delete', async () => {
      const adminUser = { id: 1, roles: ['admin'] }
      const collection = (engine.config.collections as unknown as Array<{ slug: string }>).find((c) => c.slug === 'pages')
      if (!collection) {
        throw new Error('pages collection not found')
      }

      const perms = await buildCollectionPermissions(collection as any, adminUser, engine)
      // All should evaluate for admin
      expect(typeof perms.read).toBe('boolean')
      expect(typeof perms.create).toBe('boolean')
      expect(typeof perms.update).toBe('boolean')
      expect(typeof perms.delete).toBe('boolean')
    })
  })

  describe('can() function', () => {
    it('allows admin all resources and actions', () => {
      const adminUser = { id: 1, roles: ['admin'] } as any
      expect(can(adminUser, 'pages', 'read', {})).toBe(true)
      expect(can(adminUser, 'pages', 'create', {})).toBe(true)
      expect(can(adminUser, 'pages', 'update', {})).toBe(true)
      expect(can(adminUser, 'pages', 'delete', {})).toBe(true)
    })

    it('respects built-in editor role for content collections', () => {
      const editorUser = { id: 2, roles: ['editor'] } as any
      // Editor should have access to content collections
      expect(can(editorUser, 'pages', 'read', {})).toBe(true)
      expect(can(editorUser, 'pages', 'create', {})).toBe(true)
      expect(can(editorUser, 'pages', 'update', {})).toBe(true)
      expect(can(editorUser, 'pages', 'delete', {})).toBe(true)
    })

    it('respects built-in viewer role (read-only)', () => {
      const viewerUser = { id: 3, roles: ['viewer'] } as any
      // Viewer should only have read on content collections
      expect(can(viewerUser, 'pages', 'read', {})).toBe(true)
      expect(can(viewerUser, 'pages', 'create', {})).toBe(false)
      expect(can(viewerUser, 'pages', 'update', {})).toBe(false)
      expect(can(viewerUser, 'pages', 'delete', {})).toBe(false)
    })

    it('denies customer access to admin resources', () => {
      const customerUser = { id: 4, roles: ['customer'] } as any
      // Customer should not have admin access to pages
      expect(can(customerUser, 'pages', 'read', {})).toBe(false)
      expect(can(customerUser, 'pages', 'create', {})).toBe(false)
      expect(can(customerUser, 'pages', 'update', {})).toBe(false)
      expect(can(customerUser, 'pages', 'delete', {})).toBe(false)
    })

    it('denies non-admin access to secret resources', () => {
      const editorUser = { id: 2, roles: ['editor'] } as any
      // Editor should NOT have access to secret resources
      expect(can(editorUser, 'users', 'read', {})).toBe(false)
      expect(can(editorUser, 'settings:security-settings', 'read', {})).toBe(false)
    })

    it('admin always has access to secret resources', () => {
      const adminUser = { id: 1, roles: ['admin'] } as any
      // Admin should have full access to secret resources
      expect(can(adminUser, 'users', 'read', {})).toBe(true)
      expect(can(adminUser, 'users', 'update', {})).toBe(true)
      expect(can(adminUser, 'settings:security-settings', 'read', {})).toBe(true)
    })
  })

  describe('admin behavior unchanged', () => {
    it('admin can still perform all actions', () => {
      const adminUser = { id: 1, roles: ['admin'] } as any
      const resources = ['pages', 'posts', 'media', 'events', 'users', 'settings:site-settings']
      const actions = ['read', 'create', 'update', 'delete'] as const

      for (const resource of resources) {
        for (const action of actions) {
          expect(can(adminUser, resource as any, action, {})).toBe(true)
        }
      }
    })
  })

  describe('settings access control', () => {
    it('admin has access to all settings:* resources', () => {
      const adminUser = { id: 1, roles: ['admin'] } as any
      expect(can(adminUser, 'settings:site-settings', 'read', {})).toBe(true)
      expect(can(adminUser, 'settings:seo-settings', 'read', {})).toBe(true)
      expect(can(adminUser, 'settings:security-settings', 'read', {})).toBe(true)
    })

    it('editor cannot access secret settings resources', () => {
      const editorUser = { id: 2, roles: ['editor'] } as any
      // Editor should not have access to secret settings
      expect(can(editorUser, 'settings:security-settings', 'read', {})).toBe(false)
      expect(can(editorUser, 'settings:integrations', 'read', {})).toBe(false)
      expect(can(editorUser, 'settings:payment-settings', 'read', {})).toBe(false)
    })

    it('viewer cannot access settings resources', () => {
      const viewerUser = { id: 3, roles: ['viewer'] } as any
      expect(can(viewerUser, 'settings:site-settings', 'read', {})).toBe(false)
      expect(can(viewerUser, 'settings:seo-settings', 'read', {})).toBe(false)
    })

    it('customer cannot access any settings resources', () => {
      const customerUser = { id: 4, roles: ['customer'] } as any
      expect(can(customerUser, 'settings:site-settings', 'read', {})).toBe(false)
    })
  })

  describe('collection read permission for nav visibility', () => {
    it('editor cannot read secret collections like users', () => {
      const editorUser = { id: 2, roles: ['editor'] } as any
      expect(can(editorUser, 'users', 'read', {})).toBe(false)
      expect(can(editorUser, 'roles', 'read', {})).toBe(false)
    })

    it('viewer has read access to content collections', () => {
      const viewerUser = { id: 3, roles: ['viewer'] } as any
      expect(can(viewerUser, 'pages', 'read', {})).toBe(true)
      expect(can(viewerUser, 'posts', 'read', {})).toBe(true)
      expect(can(viewerUser, 'media', 'read', {})).toBe(true)
    })

    it('viewer cannot create, update or delete content', () => {
      const viewerUser = { id: 3, roles: ['viewer'] } as any
      expect(can(viewerUser, 'pages', 'create', {})).toBe(false)
      expect(can(viewerUser, 'pages', 'update', {})).toBe(false)
      expect(can(viewerUser, 'pages', 'delete', {})).toBe(false)
    })
  })
})
