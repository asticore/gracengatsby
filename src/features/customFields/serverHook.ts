import { ValidationError } from '@/localapi/operations'

import { definitionsFor, applyDefaults, validateFieldValues } from './validate'
import { loadFieldGroups, locationContextFor } from './server'
import { pruneHiddenValues } from './conditions'

/**
 * The write-time half of custom fields, called by the beforeValidate hook on
 * the shared `customFields` field (src/fields/customFields.ts).
 *
 * - Loads the groups. If that fails: a signed-in non-admin's save is refused
 *   (fail closed); an admin's, or a system write's, goes through untouched.
 * - Only groups whose location matches this document apply. Groups that do not
 *   use a role rule apply whoever is saving; role rules are checked against the saver.
 * - Create: fills defaults. Update with no customFields in the payload: nothing
 *   to write, so the stored values are kept; if the save publishes the document,
 *   the stored values are validated too.
 * - Drops values of fields hidden by their conditions, then validates the rest.
 */
export async function prepareCustomFieldsForSave({
  collection,
  operation,
  value,
  doc,
  userRoles,
}: {
  collection: string
  operation: 'create' | 'update'
  value: unknown
  doc: Record<string, unknown>
  userRoles?: string[] | null
}): Promise<unknown> {
  // A signed-in user who is not an admin. System writes (no user) and admins are not in this group.
  const nonAdminUser = userRoles !== undefined && userRoles !== null && !userRoles.includes('admin')

  let groups
  try {
    groups = await loadFieldGroups()
  } catch (error) {
    console.error('custom fields: could not load field groups', error)
    if (nonAdminUser) {
      throw new ValidationError([{ path: 'customFields', message: 'Custom fields could not be validated; try again.' }])
    }
    return value
  }

  const defs = definitionsFor(groups, locationContextFor(collection, doc, userRoles ?? null))
  if (defs.length === 0) return value

  // A save that publishes must check what is stored, even when the payload leaves customFields out.
  const publishes = doc._status === 'published'
  if (value === undefined && operation === 'update' && !publishes) return value

  const source = value === undefined ? doc.customFields : value
  let values: Record<string, unknown> = source && typeof source === 'object' && !Array.isArray(source) ? { ...(source as Record<string, unknown>) } : {}
  if (operation === 'create') values = applyDefaults(defs, values)
  values = pruneHiddenValues(defs, values)

  const problems = validateFieldValues(defs, values)
  if (problems.length > 0) {
    throw new ValidationError(problems.map((p) => ({ path: p.path, message: p.message })))
  }
  if (value === undefined && operation === 'update') return value
  return values
}
