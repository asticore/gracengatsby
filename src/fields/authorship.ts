import type { Field } from '@/engine'

/**
 * Authorship tracking: `createdBy` and `updatedBy` relationships to the users collection.
 * Both are hidden from the edit form (admin.hidden: true) and read-only.
 * Set automatically by the `authorshipBeforeChange` hook.
 */
export const authorshipFields: Field[] = [
  {
    name: 'createdBy',
    type: 'relationship',
    relationTo: 'users',
    hasMany: false,
    admin: {
      hidden: true,
      readOnly: true,
    },
  },
  {
    name: 'updatedBy',
    type: 'relationship',
    relationTo: 'users',
    hasMany: false,
    admin: {
      hidden: true,
      readOnly: true,
    },
  },
]

/**
 * Hook to set createdBy and updatedBy fields based on the current user.
 * Use in collection's `hooks.beforeChange` array.
 *
 * Behavior:
 * - On create: sets both `createdBy` and `updatedBy` to `req.user.id`
 * - On update: sets `updatedBy` to `req.user.id` and preserves `createdBy` from the original doc
 * - If no `req.user` (internal jobs, seeds): leaves data untouched
 */
export const authorshipBeforeChange = async ({
  data,
  operation,
  req,
  originalDoc,
}: {
  data: Record<string, unknown>
  operation: 'create' | 'update'
  req: { user?: { id: string | number } }
  originalDoc?: Record<string, unknown>
}) => {
  if (!req.user?.id) {
    // No user context - leave data untouched (internal jobs, seeds, etc)
    return
  }

  if (operation === 'create') {
    // On create, set both createdBy and updatedBy
    data.createdBy = req.user.id
    data.updatedBy = req.user.id
  } else {
    // On update, set updatedBy and preserve createdBy from original
    data.updatedBy = req.user.id

    if (originalDoc) {
      // Handle originalDoc.createdBy being either an id or an object with an id property
      const originalCreatedBy = typeof originalDoc.createdBy === 'object' && originalDoc.createdBy !== null
        ? (originalDoc.createdBy as { id?: string | number }).id
        : originalDoc.createdBy

      if (originalCreatedBy) {
        // Preserve the original createdBy, ignoring any client-sent value
        data.createdBy = originalCreatedBy
      }
    }
  }
}
