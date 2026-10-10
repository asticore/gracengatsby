import type { Field } from '@/engine'

/**
 * Storage for the values of any Field Group targeting this collection.
 *
 * One JSON column holds every custom field's value, keyed by the field `name`
 * set on the Field Group. The editing UI is the CustomFieldsPanel component.
 *
 * The beforeValidate hook is the server-side half of the feature: it loads the
 * groups that apply to this document (by location), applies defaults on create,
 * drops values of hidden fields, and rejects the save with a ValidationError
 * listing every invalid field label. Infrastructure failures while loading the
 * groups fail OPEN - the save goes through - so a database hiccup never blocks
 * editing. Everything is loaded through dynamic imports so this config stays
 * safe to import from client code.
 */
function userRolesOf(req: unknown): string[] | null {
  const roles = (req as { user?: { roles?: unknown } } | undefined)?.user?.roles
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : null
}

export const customFieldsField: Field = {
  name: 'customFields',
  type: 'json',
  label: 'Custom fields',
  admin: {
    components: {
      Field: '@/fields/customFields/CustomFieldsPanel#CustomFieldsPanel',
    },
  },
  hooks: {
    beforeValidate: [
      async (args: Record<string, unknown>) => {
        const value = args.value
        const operation = args.operation as string | undefined
        const collection = args.collection as string | { slug?: string } | undefined
        const slug = typeof collection === 'string' ? collection : collection?.slug
        if (!slug) return value

        const siblingData = (args.siblingData ?? {}) as Record<string, unknown>
        const originalDoc = (args.originalDoc ?? {}) as Record<string, unknown>

        let server: typeof import('@/features/customFields/serverHook')
        try {
          server = await import('@/features/customFields/serverHook')
        } catch (error) {
          console.error('custom fields: could not load validation, saving without it', error)
          return value
        }

        const prepared = await server.prepareCustomFieldsForSave({
          collection: slug,
          operation: operation === 'create' ? 'create' : 'update',
          value,
          doc: { ...originalDoc, ...siblingData },
          userRoles: userRolesOf(args.req),
        })
        return prepared
      },
    ],
  },
}
