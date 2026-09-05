import type { Field } from '@/engine'

/**
 * Storage for the values of any Field Group targeting this collection.
 *
 * One JSON column holds every custom field's value, keyed by the field `name`
 * set on the Field Group. The editing UI is the CustomFieldsPanel component,
 * which loads the matching Field Group definitions at runtime and renders real
 * inputs - so adding a field never needs a schema migration.
 */
export const customFieldsField: Field = {
  name: 'customFields',
  type: 'json',
  label: 'Custom fields',
  admin: {
    components: {
      Field: '@/fields/customFields/CustomFieldsPanel#CustomFieldsPanel',
    },
  },
}
