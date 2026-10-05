import type { CollectionConfig, CollectionBeforeChangeHook } from '@/engine'

import { isAdmin, isAdminOrSelf } from '../access/ecommerceAccess'
import { validateRoleChange } from '@/features/roles/permissions'

/**
 * Validates role changes to prevent removing the last admin or self-lockout.
 */
const validateUserRoleChange: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, operation } = args as any

  // Only validate updates
  if (operation !== 'update') return

  // Only validate if roles are being changed
  const newRoles = data.roles
  if (!newRoles || !Array.isArray(newRoles)) return
  if (!originalDoc?.id) return

  // Count remaining admins from the database
  const { docs: adminDocs } = await req.engine.find({
    collection: 'users',
    where: { roles: { in: ['admin'] } },
    limit: 0,
    overrideAccess: true,
  })

  const adminCount = (adminDocs as any[]).length
  const isRemovingAdmin = originalDoc.roles?.includes('admin') && !newRoles.includes('admin')
  const newAdminCount = isRemovingAdmin ? adminCount - 1 : adminCount

  // Validate the role change
  const validation = validateRoleChange({
    actor: req.user,
    target: originalDoc,
    newRoles,
    adminCount: newAdminCount,
  })

  if (!validation.ok) {
    const error = new Error(validation.reason || 'Invalid role change')
    ;(error as any).statusCode = 400
    throw error
  }
}

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
  beforeChange: [validateUserRoleChange],
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['customer'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Viewer', value: 'viewer' },
        { label: 'Customer', value: 'customer' },
      ],
      access: {
        // only admins can change roles
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
    },
    {
      name: 'customRole',
      type: 'relationship',
      relationTo: 'roles',
      required: false,
      access: {
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
      admin: {
        hidden: false,
        condition: ({ user }) => Boolean(user?.roles?.includes('admin')),
      },
    },
  ],
  versions: false,
}
