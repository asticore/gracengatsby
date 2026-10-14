import type { Field } from '@/engine'

/**
 * Product add-ons: one collapsible card in the product edit screen holding a list of questions the buyer
 * answers on the product page. Column names follow src/cms/db/schema/generate.ts; the migration in
 * src/migrations/20261028_100000_add_ons_pricing_rules.ts creates exactly these (child table
 * eg_products_add_ons, and the versioned copy). Rules live in lib/addOns.ts.
 *
 * `admin.condition` functions are shipped to the browser as source text, so each one must be
 * self-contained: no imports, no outer variables.
 */
export const addOnFields: Field[] = [
  {
    type: 'collapsible',
    label: 'Add-ons (questions for the buyer)',
    admin: { condition: (data) => data?.productType !== 'giftcard' && data?.productType !== 'external' && data?.productType !== 'grouped' },
    fields: [
      {
        name: 'addOns',
        type: 'array',
        labels: { singular: 'Add-on', plural: 'Add-ons' },
        admin: {
          description:
            'Questions the buyer answers before adding to the cart, such as an engraving or a gift note. Each can add a price. Shop settings > Storefront has the switch that turns add-ons on or off across the shop.',
          initCollapsed: true,
        },
        fields: [
          { name: 'label', type: 'text', required: true, admin: { width: '50%', description: 'The question the buyer sees, e.g. Engraving.' } },
          {
            name: 'inputType',
            type: 'select',
            defaultValue: 'text',
            options: [
              { label: 'Short text (one line)', value: 'text' },
              { label: 'Long text (several lines)', value: 'textarea' },
              { label: 'Tick box (yes or no)', value: 'checkbox' },
              { label: 'Drop-down (pick one choice)', value: 'select' },
            ],
            admin: { width: '50%', description: 'How the buyer answers.' },
          },
          { name: 'description', type: 'text', admin: { description: 'Optional help text shown under the question.' } },
          {
            name: 'choices',
            type: 'text',
            admin: {
              condition: (data) => data?.inputType === 'select',
              description: 'The choices for the drop-down, separated by "|", e.g. Small | Medium | Large.',
            },
          },
          { name: 'required', type: 'checkbox', defaultValue: false, admin: { description: 'The buyer must answer this before the product can be added to the cart.' } },
          {
            type: 'row',
            fields: [
              {
                name: 'price',
                type: 'number',
                min: 0,
                admin: { width: '50%', description: 'Extra price in dollars. Leave blank for no charge. A tick box or drop-down adds this once when it is used.' },
              },
              {
                name: 'priceMode',
                type: 'select',
                defaultValue: 'fixed',
                options: [
                  { label: 'Fixed amount', value: 'fixed' },
                  { label: 'Per character typed', value: 'perCharacter' },
                ],
                admin: { width: '50%', description: 'Fixed: the same charge every time. Per character: the price times the number of characters typed.' },
              },
            ],
          },
          {
            name: 'maxLength',
            type: 'number',
            min: 1,
            admin: {
              condition: (data) => data?.inputType === 'text' || data?.inputType === 'textarea',
              description: 'The longest answer allowed, in characters. Blank means 200 for short text and 1000 for long text.',
            },
          },
        ],
      },
    ],
  },
]
