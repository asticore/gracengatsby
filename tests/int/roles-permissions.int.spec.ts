// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  RESOURCES,
  SECRET_RESOURCES,
  can,
  canRemoveAdmin,
  wouldLockOutSelf,
  validateRoleChange,
  type Resource,
  type Action,
} from '@/features/roles/permissions'

describe('roles/permissions - pure permission logic', () => {
  describe('can() - built-in roles', () => {
    it('admin can read any resource', () => {
      const user = { id: 1, roles: ['admin'] }
      for (const resource of RESOURCES) {
        expect(can(user, resource, 'read'), `admin should read ${resource}`).toBe(true)
      }
    })

    it('admin can create/update/delete any resource', () => {
      const user = { id: 1, roles: ['admin'] }
      for (const resource of RESOURCES) {
        for (const action of ['create', 'update', 'delete'] as const) {
          expect(can(user, resource, action), `admin should ${action} ${resource}`).toBe(true)
        }
      }
    })

    it('editor can read/create/update/delete content and media, not settings/users/roles', () => {
      const user = { id: 2, roles: ['editor'] }

      // Editor can do everything on content
      expect(can(user, 'pages', 'read')).toBe(true)
      expect(can(user, 'posts', 'create')).toBe(true)
      expect(can(user, 'media', 'update')).toBe(true)
      expect(can(user, 'events', 'delete')).toBe(true)
      expect(can(user, 'redirects', 'read')).toBe(true)
      expect(can(user, 'admin-schedule', 'create')).toBe(true)

      // Editor cannot access settings, users, roles
      expect(can(user, 'settings:integrations', 'read')).toBe(false)
      expect(can(user, 'settings:security-settings', 'read')).toBe(false)
      expect(can(user, 'settings:payment-settings', 'read')).toBe(false)
      expect(can(user, 'users', 'read')).toBe(false)
      expect(can(user, 'roles', 'read')).toBe(false)

      // Editor cannot delete versions
      expect(can(user, 'versions.delete', 'read')).toBe(false)
    })

    it('viewer can only read content, nothing else', () => {
      const user = { id: 3, roles: ['viewer'] }

      // Viewer can read content
      expect(can(user, 'pages', 'read')).toBe(true)
      expect(can(user, 'posts', 'read')).toBe(true)
      expect(can(user, 'media', 'read')).toBe(true)

      // Viewer cannot create/update/delete
      expect(can(user, 'pages', 'create')).toBe(false)
      expect(can(user, 'posts', 'update')).toBe(false)
      expect(can(user, 'media', 'delete')).toBe(false)

      // Viewer cannot access orders/shop
      expect(can(user, 'orders', 'read')).toBe(false)
    })

    it('customer has no admin area access', () => {
      const user = { id: 4, roles: ['customer'] }

      for (const resource of RESOURCES) {
        expect(can(user, resource, 'read'), `customer should not read ${resource}`).toBe(false)
      }
    })
  })

  describe('can() - custom matrix guards', () => {
    it('secret resources deny even if custom matrix grants them', () => {
      const user = { id: 5, roles: [] as string[] }
      const customMatrix: Partial<Record<Resource, Partial<Record<Action, boolean>>>> = {
        'settings:integrations': { read: true },
        'settings:security-settings': { read: true },
        'settings:payment-settings': { read: true },
        users: { read: true },
        roles: { read: true },
      }

      for (const secret of SECRET_RESOURCES) {
        expect(can(user, secret as Resource, 'read', customMatrix)).toBe(false)
      }
    })

    it('non-secret resources respect custom matrix union', () => {
      const user = { id: 6, roles: ['viewer'] as string[] }
      // Viewer can only read by default
      expect(can(user, 'pages', 'create')).toBe(false)

      // Custom matrix adds create permission
      const customMatrix: Partial<Record<Resource, Partial<Record<Action, boolean>>>> = { pages: { create: true } }
      expect(can(user, 'pages', 'create', customMatrix)).toBe(true)

      // Still respects built-in role limits on other resources
      expect(can(user, 'orders', 'read')).toBe(false)
    })
  })

  describe('can() - edge cases', () => {
    it('returns false for missing user', () => {
      expect(can(null, 'pages', 'read')).toBe(false)
      expect(can(undefined, 'pages', 'read')).toBe(false)
    })

    it('returns false for unknown resource by non-admin', () => {
      const user = { id: 1, roles: ['viewer'] as string[] }
      expect(can(user, 'unknown-resource' as Resource, 'read')).toBe(false)
    })

    it('returns false for user with no roles', () => {
      const user = { id: 2, roles: [] as string[] }
      expect(can(user, 'pages', 'read')).toBe(false)
    })
  })

  describe('canRemoveAdmin()', () => {
    it('allows removing admin if at least one remains', () => {
      expect(canRemoveAdmin(0)).toBe(false)
      expect(canRemoveAdmin(1)).toBe(true)
      expect(canRemoveAdmin(2)).toBe(true)
    })
  })

  describe('wouldLockOutSelf()', () => {
    it('detects self-lockout when user removes their own admin role', () => {
      const actingUserId = 1
      const targetUserId = 1
      const newRoles = ['customer']

      expect(wouldLockOutSelf(actingUserId, targetUserId, newRoles)).toBe(true)
    })

    it('ignores when acting user is different', () => {
      expect(wouldLockOutSelf(1, 2, ['customer'])).toBe(false)
    })

    it('ignores when admin role is kept', () => {
      expect(wouldLockOutSelf(1, 1, ['admin', 'customer'])).toBe(false)
    })
  })

  describe('validateRoleChange()', () => {
    it('denies removing the last admin', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 2, roles: ['admin'] },
        newRoles: ['customer'],
        adminCount: 1,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('last admin')
    })

    it('allows removing admin if others exist', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 2, roles: ['admin'] },
        newRoles: ['customer'],
        adminCount: 2,
      })

      expect(result.ok).toBe(true)
    })

    it('denies user removing their own admin role', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 1, roles: ['admin'] },
        newRoles: ['customer'],
        adminCount: 2,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('own admin')
    })

    it('allows adding roles to self', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 1, roles: ['admin'] },
        newRoles: ['admin', 'editor'],
        adminCount: 1,
      })

      expect(result.ok).toBe(true)
    })
  })
})
