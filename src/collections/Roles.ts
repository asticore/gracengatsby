import type { CollectionConfig } from '@/engine'

import { invalidateCustomRole, sanitizeRolePermissions } from '@/features/roles/customRoleCache'

export const Roles: CollectionConfig = {
  slug: 'roles',
  dbName: 'eg_roles',
  labels: {
    singular: 'Role',
    plural: 'Roles',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Settings',
  },
  access: {
    create: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
    read: ({ req }) => Boolean(req.user && req.user.roles?.length),
    update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
    delete: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      access: {
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      required: true,
      access: {
        update: ({ req, doc }) => {
          if (!req.user?.roles?.includes('admin')) return false
          // Built-in roles cannot have slug changed
          if (doc?.builtIn) return false
          return true
        },
      },
    },
    {
      name: 'description',
      type: 'textarea',
      access: {
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
    },
    {
      name: 'builtIn',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    {
      name: 'permissions',
      type: 'json',
      access: {
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data }: { data?: Record<string, unknown> }) => {
        // Keep the stored matrix to what can() understands (known resources, boolean actions, scope).
        if (data && data.permissions !== undefined && data.permissions !== null) {
          data.permissions = sanitizeRolePermissions(data.permissions)
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc }: { doc?: { id?: number } }) => {
        invalidateCustomRole(doc?.id)
      },
    ],
    afterDelete: [
      async ({ id, doc }: { id?: number | string; doc?: { id?: number } }) => {
        invalidateCustomRole(id ?? doc?.id)
      },
    ],
  },
  versions: false,
}
