/** Shape of a Field Group as returned by /api/field-groups. */

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'image'
  | 'url'
  | 'date'
  | 'color'

export type CustomFieldDef = {
  id?: string
  label: string
  name: string
  type: CustomFieldType
  required?: boolean | null
  options?: { label: string; value: string }[] | null
  helpText?: string | null
  defaultValue?: string | null
}

export type FieldGroupDoc = {
  id: number
  name: string
  description?: string | null
  targetCollections?: string[] | null
  fields?: CustomFieldDef[] | null
}

/** Values live in one JSON column, keyed by CustomFieldDef.name. */
export type CustomFieldValues = Record<string, unknown>

/** Fetches the Field Groups that apply to a given collection. */
export async function fetchFieldGroups(collectionSlug: string): Promise<FieldGroupDoc[]> {
  const res = await fetch(`/api/field-groups?limit=100&depth=0`, { credentials: 'include' })
  if (!res.ok) return []
  const json = (await res.json()) as { docs?: FieldGroupDoc[] }
  return (json.docs || []).filter((group) => (group.targetCollections || []).includes(collectionSlug))
}
