import { describe, expect, it } from 'vitest'
import type { SanitizedCollectionConfig } from '@/engine'
import { buildCollectionPermissions } from '@/admin/auth'
import { getEngine } from '@/lib/engine'

describe('admin permissions', () => {
  describe('buildCollectionPermissions', () => {
    it('returns false for delete when access.delete evaluates to false', async () => {
      const engine = await getEngine()
      const collection: SanitizedCollectionConfig = {
        slug: 'test-collection',
        labels: { singular: 'Test', plural: 'Tests' },
        fields: [],
        admin: {},
        access: {
          delete: () => false,
        },
      }
      const user = { id: 1, roles: ['user'] }

      const permissions = await buildCollectionPermissions(collection, user, engine)

      expect(permissions.delete).toBe(false)
    })

    it('returns true for delete when access.delete evaluates to true', async () => {
      const engine = await getEngine()
      const collection: SanitizedCollectionConfig = {
        slug: 'test-collection',
        labels: { singular: 'Test', plural: 'Tests' },
        fields: [],
        admin: {},
        access: {
          delete: () => true,
        },
      }
      const user = { id: 1, roles: ['user'] }

      const permissions = await buildCollectionPermissions(collection, user, engine)

      expect(permissions.delete).toBe(true)
    })

    it('returns true for delete when no access.delete is defined (defaults to open)', async () => {
      const engine = await getEngine()
      const collection: SanitizedCollectionConfig = {
        slug: 'test-collection',
        labels: { singular: 'Test', plural: 'Tests' },
        fields: [],
        admin: {},
        access: {},
      }
      const user = { id: 1, roles: ['user'] }

      const permissions = await buildCollectionPermissions(collection, user, engine)

      expect(permissions.delete).toBe(true)
    })

    it('returns true for update when no access.update is defined (defaults to open)', async () => {
      const engine = await getEngine()
      const collection: SanitizedCollectionConfig = {
        slug: 'test-collection',
        labels: { singular: 'Test', plural: 'Tests' },
        fields: [],
        admin: {},
        access: {},
      }
      const user = { id: 1, roles: ['user'] }

      const permissions = await buildCollectionPermissions(collection, user, engine)

      expect(permissions.update).toBe(true)
    })

    it('returns false for update when access.update evaluates to false', async () => {
      const engine = await getEngine()
      const collection: SanitizedCollectionConfig = {
        slug: 'test-collection',
        labels: { singular: 'Test', plural: 'Tests' },
        fields: [],
        admin: {},
        access: {
          update: () => false,
        },
      }
      const user = { id: 1, roles: ['user'] }

      const permissions = await buildCollectionPermissions(collection, user, engine)

      expect(permissions.update).toBe(false)
    })

    it('includes all four permissions: create, read, update, delete', async () => {
      const engine = await getEngine()
      const collection: SanitizedCollectionConfig = {
        slug: 'test-collection',
        labels: { singular: 'Test', plural: 'Tests' },
        fields: [],
        admin: {},
        access: {
          create: () => true,
          read: () => true,
          update: () => true,
          delete: () => true,
        },
      }
      const user = { id: 1, roles: ['user'] }

      const permissions = await buildCollectionPermissions(collection, user, engine)

      expect(permissions).toEqual({
        create: true,
        read: true,
        update: true,
        delete: true,
      })
    })
  })
})
