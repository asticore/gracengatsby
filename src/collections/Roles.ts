import type { CollectionConfig } from '@/engine'

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
  versions: false,
}
