import type { Field } from '@/engine'

/**
 * The consent group is hidden on the Integrations form (see Integrations.ts)
 * so it has its own page. This clears that flag on this page's copy of the
 * fields so the group renders here. Nothing else about the field changes.
 */
export function revealConsentGroup(fields: Field[]): Field[] {
  return fields.map((field) => {
    if (field.type !== 'group' || !('name' in field) || field.name !== 'consent') return field
    const admin = { ...((field as { admin?: Record<string, unknown> }).admin ?? {}) }
    delete admin.hidden
    return { ...field, admin } as Field
  })
}
