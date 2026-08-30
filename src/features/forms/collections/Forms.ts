import type { CollectionConfig, Field } from 'payload'

import { isAdmin } from '@/access/ecommerceAccess'

import { submitEndpoint } from '../submitEndpoint'

/**
 * A form, defined from inside the portal.
 *
 * Same shape of problem as Field Groups: the site owner defines a schema at
 * runtime, so it is stored as an ordered array of field definitions rather than
 * as real columns. A new form is a content change, never a migration - which
 * this project needs anyway, since the CLI cannot reach production D1 from CI.
 *
 * Everything that reads this - the renderer, the calculation parser, the
 * conditional evaluator, the pricing - works from the definitions in `fields`,
 * so the only thing that must stay stable is the `name` on each field. That is
 * why `name` is required and why the description says so plainly: renaming a
 * field orphans every stored submission that used the old name.
 */

const NAMED_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'radio',
  'checkbox',
  'date',
  'file',
  'hidden',
  'calculation',
]

const CHOICE_TYPES = ['select', 'radio', 'checkbox']

const hasName = (siblingData: { type?: string }): boolean => NAMED_TYPES.includes(siblingData?.type)

const conditionalGroup: Field = {
  type: 'group',
  name: 'conditional',
  label: 'Conditional logic',
  admin: {
    description:
      'Show or hide this field depending on what someone has answered elsewhere. The rule is applied both in the browser and again when the form is sent, so a hidden field cannot be submitted.',
  },
  fields: [
    { name: 'enabled', type: 'checkbox', defaultValue: false, label: 'Use conditional logic' },
    {
      type: 'row',
      admin: { condition: (_, s) => Boolean(s?.enabled) },
      fields: [
        {
          name: 'action',
          type: 'select',
          defaultValue: 'show',
          options: [
            { label: 'Show this field when...', value: 'show' },
            { label: 'Hide this field when...', value: 'hide' },
          ],
          admin: { width: '50%' },
        },
        {
          name: 'match',
          type: 'select',
          defaultValue: 'all',
          options: [
            { label: 'All rules match', value: 'all' },
            { label: 'Any rule matches', value: 'any' },
          ],
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'rules',
      type: 'array',
      labels: { singular: 'Rule', plural: 'Rules' },
      admin: { condition: (_, s) => Boolean(s?.enabled), initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'field',
              type: 'text',
              required: true,
              admin: { width: '34%', description: 'The name of another field on this form.' },
            },
            {
              name: 'operator',
              type: 'select',
              defaultValue: 'equals',
              options: [
                { label: 'is', value: 'equals' },
                { label: 'is not', value: 'notEquals' },
                { label: 'contains', value: 'contains' },
                { label: 'does not contain', value: 'notContains' },
                { label: 'is greater than', value: 'greaterThan' },
                { label: 'is less than', value: 'lessThan' },
                { label: 'is empty', value: 'isEmpty' },
                { label: 'is not empty', value: 'isNotEmpty' },
              ],
              admin: { width: '33%' },
            },
            {
              name: 'value',
              type: 'text',
              admin: {
                width: '33%',
                condition: (_, s) => !['isEmpty', 'isNotEmpty'].includes(s?.operator),
              },
            },
          ],
        },
      ],
    },
  ],
}

export const Forms: CollectionConfig = {
  slug: 'forms',
  dbName: 'eg_forms',
  labels: { singular: 'Form', plural: 'Forms' },
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['title', 'updatedAt'],
    description:
      'Build a form, then drop it onto any page with the Form block. Entries appear under Form Submissions.',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    update: isAdmin,
    // Public: the front-end renderer loads the form definition to draw it.
    // Only the allow-listed subset in settings.ts ever reaches the browser.
    read: () => true,
  },
  endpoints: [submitEndpoint],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'Shown above the form, and used to identify it in the Form block.' },
    },
    {
      name: 'fields',
      type: 'array',
      labels: { singular: 'Field', plural: 'Fields' },
      minRows: 1,
      admin: {
        initCollapsed: true,
        description: 'Drag to reorder. This is the order visitors see.',
      },
      fields: [
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
                { label: 'Email', value: 'email' },
                { label: 'Phone', value: 'phone' },
                { label: 'Number', value: 'number' },
                { label: 'Dropdown', value: 'select' },
                { label: 'Radio buttons', value: 'radio' },
                { label: 'Checkboxes', value: 'checkbox' },
                { label: 'Date', value: 'date' },
                { label: 'File upload', value: 'file' },
                { label: 'Hidden', value: 'hidden' },
                { label: 'Calculation', value: 'calculation' },
                { label: 'HTML', value: 'html' },
                { label: 'Section break', value: 'section' },
                { label: 'Page break', value: 'page' },
              ],
              admin: { width: '50%' },
            },
            {
              name: 'width',
              type: 'select',
              defaultValue: 'full',
              options: [
                { label: 'Full width', value: 'full' },
                { label: 'Half', value: 'half' },
                { label: 'Third', value: 'third' },
                { label: 'Two thirds', value: 'twoThirds' },
                { label: 'Quarter', value: 'quarter' },
              ],
              admin: { width: '50%', condition: (_, s) => s?.type !== 'page' },
            },
          ],
        },
        {
          type: 'row',
          admin: { condition: (_, s) => s?.type !== 'page' },
          fields: [
            {
              name: 'label',
              type: 'text',
              admin: {
                width: '50%',
                description: 'What the visitor reads. On a section break this is the heading.',
              },
            },
            {
              name: 'name',
              type: 'text',
              admin: {
                width: '50%',
                condition: (_, s) => hasName(s),
                description:
                  'The key this answer is stored under, and how calculations and rules refer to it. Lowercase, no spaces. Changing it later orphans existing entries.',
              },
            },
          ],
        },
        {
          type: 'row',
          admin: { condition: (_, s) => hasName(s) && s?.type !== 'calculation' },
          fields: [
            { name: 'required', type: 'checkbox', defaultValue: false, admin: { width: '33%' } },
            {
              name: 'placeholder',
              type: 'text',
              admin: { width: '33%', condition: (_, s) => !CHOICE_TYPES.includes(s?.type) },
            },
            {
              name: 'defaultValue',
              type: 'text',
              label: 'Default',
              admin: { width: '34%' },
            },
          ],
        },
        {
          name: 'helpText',
          type: 'text',
          admin: {
            condition: (_, s) => hasName(s),
            description: 'A short note shown under the input.',
          },
        },
        {
          type: 'row',
          admin: { condition: (_, s) => s?.type === 'number' },
          fields: [
            { name: 'min', type: 'number', admin: { width: '50%' } },
            { name: 'max', type: 'number', admin: { width: '50%' } },
          ],
        },
        {
          name: 'accept',
          type: 'text',
          label: 'Accepted file types',
          admin: {
            condition: (_, s) => s?.type === 'file',
            description: 'Comma-separated extensions, e.g. ".pdf,.jpg,.png". Leave blank to accept anything.',
          },
        },
        {
          name: 'html',
          type: 'textarea',
          label: 'HTML',
          admin: {
            condition: (_, s) => s?.type === 'html' || s?.type === 'section',
            description:
              'Markup inserted as-is. On a section break this is the optional description under the heading. Only site admins can edit this, and it is rendered unescaped - do not paste anything you did not write.',
          },
        },
        {
          name: 'options',
          type: 'array',
          labels: { singular: 'Option', plural: 'Options' },
          admin: { condition: (_, s) => CHOICE_TYPES.includes(s?.type), initCollapsed: true },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'label', type: 'text', required: true, admin: { width: '40%' } },
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                  admin: { width: '30%', description: 'Stored with the entry.' },
                },
                {
                  name: 'price',
                  type: 'number',
                  admin: {
                    width: '30%',
                    description: 'Added to the total on a purchasable form. Leave blank for none.',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          name: 'calculation',
          label: 'Calculation',
          admin: { condition: (_, s) => s?.type === 'calculation' },
          fields: [
            {
              name: 'formula',
              type: 'text',
              admin: {
                description:
                  'Arithmetic over other fields on this form: + - * / % and brackets. Refer to a field by name, or wrap it in braces if the name has spaces: {number of guests} * 25 + 10. Nothing else is allowed - no functions, no text.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'decimalPlaces',
                  type: 'number',
                  defaultValue: 2,
                  admin: { width: '34%' },
                },
                { name: 'prefix', type: 'text', admin: { width: '33%', description: 'e.g. "$"' } },
                { name: 'suffix', type: 'text', admin: { width: '33%', description: 'e.g. "per night"' } },
              ],
            },
          ],
        },
        {
          type: 'group',
          name: 'pricing',
          label: 'Pricing',
          admin: {
            condition: (_, s) => hasName(s),
            description: 'Only used when this form is set to take payment.',
          },
          fields: [
            { name: 'priced', type: 'checkbox', defaultValue: false, label: 'This field affects the price' },
            {
              type: 'row',
              admin: { condition: (_, s) => Boolean(s?.priced) },
              fields: [
                {
                  name: 'amount',
                  type: 'number',
                  label: 'Flat amount',
                  admin: { width: '50%', description: 'Added once, whenever the field is filled in.' },
                },
                {
                  name: 'unitPrice',
                  type: 'number',
                  label: 'Price per unit',
                  admin: { width: '50%', description: "Multiplied by the field's own number." },
                },
              ],
            },
          ],
        },
        conditionalGroup,
      ],
    },
    {
      type: 'group',
      name: 'settings',
      label: 'Wording',
      admin: { description: 'Leave anything blank to use the site defaults from Settings > Forms.' },
      fields: [
        { name: 'submitButtonLabel', type: 'text' },
        { name: 'successMessage', type: 'textarea' },
        { name: 'errorMessage', type: 'textarea' },
        {
          name: 'redirectUrl',
          type: 'text',
          label: 'Redirect after sending',
          admin: {
            description: 'Optional. Send people to a thank-you page instead of showing the success message.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'notification',
      label: 'Notification email',
      admin: { description: 'The email you receive when someone submits this form.' },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Still subject to the site-wide switch in Settings > Forms.' },
        },
        {
          name: 'recipients',
          type: 'text',
          admin: {
            description: 'Comma-separated. Leave blank to use the addresses in Settings > Forms.',
            condition: (_, s) => Boolean(s?.enabled),
          },
        },
        {
          name: 'subject',
          type: 'text',
          admin: {
            description: 'Supports {{field_name}} placeholders. Leave blank for "New submission: <form name>".',
            condition: (_, s) => Boolean(s?.enabled),
          },
        },
        {
          name: 'message',
          type: 'textarea',
          admin: {
            description:
              'Supports {{field_name}} placeholders and {{all_fields}} for the full table of answers. Leave blank to send just the answers.',
            condition: (_, s) => Boolean(s?.enabled),
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'confirmation',
      label: 'Confirmation email',
      admin: { description: 'An optional receipt sent to whoever filled the form in.' },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        {
          name: 'toField',
          type: 'text',
          label: 'Send to the address in this field',
          admin: {
            description: 'The name of an email field on this form, e.g. "email".',
            condition: (_, s) => Boolean(s?.enabled),
          },
        },
        {
          name: 'subject',
          type: 'text',
          admin: { condition: (_, s) => Boolean(s?.enabled) },
        },
        {
          name: 'message',
          type: 'textarea',
          admin: {
            description: 'Supports {{field_name}} and {{all_fields}}.',
            condition: (_, s) => Boolean(s?.enabled),
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'spam',
      label: 'Spam',
      admin: { description: 'Overrides the site-wide filters for this form only.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'honeypot',
              type: 'select',
              defaultValue: 'inherit',
              options: [
                { label: 'Use site setting', value: 'inherit' },
                { label: 'On', value: 'on' },
                { label: 'Off', value: 'off' },
              ],
              admin: { width: '34%' },
            },
            {
              name: 'minimumFillTime',
              type: 'select',
              defaultValue: 'inherit',
              options: [
                { label: 'Use site setting', value: 'inherit' },
                { label: 'Off', value: 'off' },
              ],
              admin: { width: '33%', description: 'Turn off for a form people genuinely fill in fast.' },
            },
            {
              name: 'turnstile',
              type: 'select',
              defaultValue: 'inherit',
              options: [
                { label: 'Use site setting', value: 'inherit' },
                { label: 'On', value: 'on' },
                { label: 'Off', value: 'off' },
              ],
              admin: { width: '33%' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'payment',
      label: 'Payment',
      admin: {
        description:
          'Price a submission and hand it to checkout. Entries are priced and stored; taking the payment itself is not wired up yet - see the note on the block.',
      },
      fields: [
        { name: 'purchasable', type: 'checkbox', defaultValue: false, label: 'This form takes payment' },
        {
          type: 'row',
          admin: { condition: (_, s) => Boolean(s?.purchasable) },
          fields: [
            {
              name: 'basePrice',
              type: 'number',
              admin: { width: '50%', description: 'Charged on every submission, before any field pricing.' },
            },
            {
              name: 'currency',
              type: 'text',
              defaultValue: 'AUD',
              admin: { width: '50%' },
            },
          ],
        },
        {
          name: 'totalField',
          type: 'text',
          admin: {
            condition: (_, s) => Boolean(s?.purchasable),
            description:
              'Optional. The name of a calculation field to use as the whole price, instead of adding up the field prices.',
          },
        },
        {
          name: 'product',
          type: 'relationship',
          relationTo: 'products',
          admin: {
            condition: (_, s) => Boolean(s?.purchasable),
            description:
              'The shop product this booking is recorded against. Required by the cart handoff once it is built.',
          },
        },
      ],
    },
  ],
  timestamps: true,
}
