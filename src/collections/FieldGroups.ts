import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Advanced-custom-fields, defined from inside the portal.
 *
 * A Field Group names a set of extra fields and the collections they attach to.
 * Every target collection carries a single `customFields` JSON column; the
 * CustomFieldsPanel component reads the groups that target that collection and
 * renders real inputs bound to keys inside that JSON.
 *
 * Doing it this way means adding a field is a content change, not a schema
 * migration - which matters here because this project's `payload migrate`
 * cannot reach production D1 from CI (see the note on the D1 binding in
 * wrangler.jsonc). Values are readable from templates as {{field:<name>}}.
 */
export const FieldGroups: CollectionConfig = {
  slug: 'field-groups',
  labels: { singular: 'Field Group', plural: 'Field Groups' },
  admin: {
    useAsTitle: 'name',
    group: 'Content',
    defaultColumns: ['name', 'targetCollections'],
    description:
      'Define extra fields for your content - like Advanced Custom Fields. Pick which collections they appear on, and they show up as real inputs when editing those items. Use them in templates as {{field:the_field_name}}.',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    update: isAdmin,
    // Readable by any signed-in user so the editing panel can load definitions.
    read: () => true,
  },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'e.g. "Product details", "Event extras".' } },
    {
      name: 'targetCollections',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['pages'],
      options: [
        { label: 'Pages', value: 'pages' },
        { label: 'Blog posts', value: 'posts' },
        { label: 'Products', value: 'products' },
        { label: 'Events', value: 'events' },
        { label: 'FAQs', value: 'faqs' },
      ],
      admin: { description: 'Which content types these fields appear on.' },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Optional note shown above the fields when editing.' },
    },
    {
      name: 'fields',
      type: 'array',
      labels: { singular: 'Field', plural: 'Fields' },
      minRows: 1,
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '50%' } },
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                width: '50%',
                description: 'Key used in merge tags: {{field:this_name}}. Lowercase, no spaces.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'type',
              type: 'select',
              required: true,
              defaultValue: 'text',
              options: [
                { label: 'Text', value: 'text' },
                { label: 'Text area', value: 'textarea' },
                { label: 'Number', value: 'number' },
                { label: 'Checkbox', value: 'checkbox' },
                { label: 'Dropdown', value: 'select' },
                { label: 'Image', value: 'image' },
                { label: 'Link / URL', value: 'url' },
                { label: 'Date', value: 'date' },
                { label: 'Colour', value: 'color' },
              ],
              admin: { width: '50%' },
            },
            { name: 'required', type: 'checkbox', defaultValue: false, admin: { width: '50%' } },
          ],
        },
        {
          name: 'options',
          type: 'array',
          labels: { singular: 'Option', plural: 'Options' },
          admin: { condition: (_, s) => s?.type === 'select', initCollapsed: true },
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'value', type: 'text', required: true },
          ],
        },
        { name: 'helpText', type: 'text', admin: { description: 'Shown under the input when editing.' } },
        { name: 'defaultValue', type: 'text', admin: { description: 'Optional starting value.' } },
      ],
    },
  ],
}
