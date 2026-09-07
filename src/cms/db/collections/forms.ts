import type { Where } from '@/engine'

import { Forms } from '@/features/forms/collections/Forms'

import { createCollectionOps } from '../generic'
import { forms, formsFields, formsFieldsConditionalRules, formsFieldsGenerated, formsFieldsOptions, formsGenerated } from '../schema'

/** One row of a field's `options` array (choice-type fields only) - a nested array inside `fields`' own subfields, eg_forms_fields_options, keyed by the owning `fields` row's own string id. */
export type FormFieldOptionRow = { id?: string; label?: string | null; value?: string | null; price?: number | null }

/** One row of the `conditional` group's `rules` array - a nested array inside a GROUP inside `fields`' own subfields, eg_forms_fields_conditional_rules, keyed by the same owning `fields` row's own string id (a group has no row/id of its own - see generateArrayTable's doc comment). */
export type FormFieldConditionalRuleRow = { id?: string; field?: string | null; operator?: string | null; value?: string | null }

/** One row of the `fields` array - see src/features/forms/collections/Forms.ts. `calculation`/`pricing`/`conditional` are groups flattened onto this array's own child table (eg_forms_fields) and reconstructed as nested objects here, the same mechanism a top-level group (e.g. Pages' `seo`) already proved, just one level deeper. */
export type FormFieldRow = {
  id?: string
  type?: string | null
  width?: string | null
  label?: string | null
  name?: string | null
  required?: boolean | null
  placeholder?: string | null
  defaultValue?: string | null
  helpText?: string | null
  min?: number | null
  max?: number | null
  accept?: string | null
  html?: string | null
  options?: FormFieldOptionRow[] | null
  calculation?: { formula?: string | null; decimalPlaces?: number | null; prefix?: string | null; suffix?: string | null } | null
  pricing?: { priced?: boolean | null; amount?: number | null; unitPrice?: number | null } | null
  conditional?: { enabled?: boolean | null; action?: string | null; match?: string | null; rules?: FormFieldConditionalRuleRow[] | null } | null
}

/** Payload's document shape for the `forms` collection - see src/features/forms/collections/Forms.ts. `settings`/`notification`/`confirmation`/`spam`/`payment` are top-level groups flattened onto eg_forms via the already-proven top-level group mechanism; `payment.product` is a single-target relationship inside one of them, same mechanism as any other single-target relationship inside a group. */
export type FormDoc = {
  id: number
  title: string
  fields?: FormFieldRow[] | null
  settings?: { submitButtonLabel?: string | null; successMessage?: string | null; errorMessage?: string | null; redirectUrl?: string | null } | null
  notification?: { enabled?: boolean | null; recipients?: string | null; subject?: string | null; message?: string | null } | null
  confirmation?: { enabled?: boolean | null; toField?: string | null; subject?: string | null; message?: string | null } | null
  spam?: { honeypot?: string | null; minimumFillTime?: string | null; turnstile?: string | null } | null
  payment?: { purchasable?: boolean | null; basePrice?: number | null; currency?: string | null; totalField?: string | null; product?: number | null } | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(
  forms,
  Forms,
  {
    fields: {
      table: formsFields,
      groupFields: formsFieldsGenerated.groupFields,
      nestedArrayTables: {
        options: { table: formsFieldsOptions },
        rules: { table: formsFieldsConditionalRules, groupName: 'conditional' },
      },
    },
  },
  { groupFields: formsGenerated.groupFields },
)

export const findForms = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<FormDoc[]>
export const findFormByID = ops.findByID as unknown as (id: number) => Promise<FormDoc | null>
export const countForms = ops.count
export const createForm = ops.create as unknown as (data: Partial<Omit<FormDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string }) => Promise<FormDoc>
export const updateForm = ops.updateByID as unknown as (id: number, data: Partial<Omit<FormDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<FormDoc | null>
export const deleteForm = ops.deleteByID
