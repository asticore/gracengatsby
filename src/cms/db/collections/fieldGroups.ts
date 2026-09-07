import type { Where } from '@/engine'

import { FieldGroups } from '@/collections/FieldGroups'

import { createCollectionOps } from '../generic'
import { fieldGroups, fieldGroupsFields, fieldGroupsFieldsOptions, fieldGroupsTargetCollections } from '../schema'

/** One row of a field's `options` array (only present when that field's own `type` is "select") - a nested array inside `fields`' own subfields, eg_field_groups_fields_options, keyed by the owning `fields` row's own string id. */
export type FieldGroupFieldOptionRow = { id?: string; label?: string | null; value?: string | null }

/** One row of the `fields` array - see src/collections/FieldGroups.ts. */
export type FieldGroupFieldRow = {
  id?: string
  label?: string | null
  name?: string | null
  type?: string | null
  required?: boolean | null
  options?: FieldGroupFieldOptionRow[] | null
  helpText?: string | null
  defaultValue?: string | null
}

/** Payload's document shape for the `field-groups` collection - see src/collections/FieldGroups.ts. `targetCollections` is a hasMany select (the same mechanism Users' `roles` proved). */
export type FieldGroupDoc = {
  id: number
  name: string
  targetCollections?: string[] | null
  description?: string | null
  fields?: FieldGroupFieldRow[] | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(
  fieldGroups,
  FieldGroups,
  {
    fields: {
      table: fieldGroupsFields,
      nestedArrayTables: { options: { table: fieldGroupsFieldsOptions } },
    },
  },
  { selectTables: { targetCollections: fieldGroupsTargetCollections } },
)

export const findFieldGroups = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<FieldGroupDoc[]>
export const findFieldGroupByID = ops.findByID as unknown as (id: number) => Promise<FieldGroupDoc | null>
export const countFieldGroups = ops.count
export const createFieldGroup = ops.create as unknown as (
  data: Partial<Omit<FieldGroupDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string },
) => Promise<FieldGroupDoc>
export const updateFieldGroup = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<FieldGroupDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<FieldGroupDoc | null>
export const deleteFieldGroup = ops.deleteByID
