import type { CollectionConfig } from '@/engine'

import { isAdmin, isAdminOrSelf } from '../access/ecommerceAccess'

export const Users: CollectionConfig = {
  slug: 'users',
  dbName: 'eg_users',
  admin: {
    useAsTitle: 'email',
    group: 'Settings',
  },
  // Without these the engine falls back to "anyone signed in", and this
  // collection is not admins-only - the shop plugin maps every customer onto
  // it. That default let any customer account change an admin's email and
  // password, then log in as that admin. Field-level access on `roles` did not
  // help, because taking over the account never needed the role changed.
  access: {
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  auth: true,
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['customer'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Customer', value: 'customer' },
      ],
      access: {
        // only admins can change roles
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
    },
  ],
  versions: false,
}
