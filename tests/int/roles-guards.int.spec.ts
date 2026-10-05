import { describe, expect, it, beforeAll } from 'vitest'
import type { Engine } from '@/engine'
import { getEngine } from '@/lib/engine'
import { validateRoleChange, can, type PermissionMatrix } from '@/features/roles/permissions'

describe('roles-guards', () => {
  let engine: Engine

  beforeAll(async () => {
    engine = await getEngine()
    // Ensure we have test data
    await new Promise((resolve) => setTimeout(resolve, 100))
  }, 180000)

  describe('validateRoleChange', () => {
    it('allows removing admin role when more than one admin exists', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 2, roles: ['admin'] },
        newRoles: ['viewer'],
        adminCount: 2,
      })
      expect(result.ok).toBe(true)
    })

    it('prevents removing the last admin', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 2, roles: ['admin'] },
        newRoles: ['viewer'],
        adminCount: 1,
      })
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/last admin/)
    })

    it('prevents user from removing their own admin role', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 1, roles: ['admin'] },
        newRoles: ['viewer'],
        adminCount: 2,
      })
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/cannot remove your own/)
    })

    it('allows promoting a user without admin role', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 2, roles: ['viewer'] },
        newRoles: ['admin', 'viewer'],
        adminCount: 1,
      })
      expect(result.ok).toBe(true)
    })

    it('allows adding another role without removing admin', () => {
      const result = validateRoleChange({
        actor: { id: 1, roles: ['admin'] },
        target: { id: 1, roles: ['admin'] },
        newRoles: ['admin', 'editor'],
        adminCount: 1,
      })
      expect(result.ok).toBe(true)
    })
  })

  describe('can() with roles', () => {
    it('allows admin full access to all resources', () => {
      const user = { id: 1, roles: ['admin'] }
      expect(can(user, 'pages', 'read')).toBe(true)
      expect(can(user, 'users', 'read')).toBe(true)
      expect(can(user, 'settings:security-settings', 'read')).toBe(true)
    })

    it('allows editor to read and edit pages', () => {
      const user = { id: 2, roles: ['editor'] }
      expect(can(user, 'pages', 'read')).toBe(true)
      expect(can(user, 'pages', 'update')).toBe(true)
      expect(can(user, 'admin-schedule', 'update')).toBe(true)
    })

    it('denies editor access to secret resources', () => {
      const user = { id: 2, roles: ['editor'] }
      expect(can(user, 'users', 'read')).toBe(false)
      expect(can(user, 'settings:integrations', 'read')).toBe(false)
    })

    it('allows viewer read-only access', () => {
      const user = { id: 3, roles: ['viewer'] }
      expect(can(user, 'pages', 'read')).toBe(true)
      expect(can(user, 'pages', 'update')).toBe(false)
      expect(can(user, 'pages', 'delete')).toBe(false)
    })

    it('denies customer access to admin resources', () => {
      const user = { id: 4, roles: ['customer'] }
      expect(can(user, 'pages', 'read')).toBe(false)
      expect(can(user, 'users', 'read')).toBe(false)
    })

    it('denies access to secrets even with custom matrix', () => {
      const user = { id: 5, roles: ['editor'] }
      const customMatrix: PermissionMatrix = {
        users: { read: true, create: true },
      } as PermissionMatrix
      // Secret resources should be denied regardless of custom matrix
      expect(can(user, 'users', 'read', customMatrix)).toBe(false)
    })
  })

  // Note: getAdminContext tests require a real request scope with headers()
  // and are therefore tested via integration tests in the route handlers themselves,
  // not in unit tests here
})
