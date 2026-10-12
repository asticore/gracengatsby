import type { Field } from '@/engine'

/**
 * Catalogue fields of the products collection, kept apart from Products.ts so that file stays a
 * readable list of content fields. Column names follow src/cms/db/schema/generate.ts (camelCase
 * field -> snake_case column, a single relationship gets an `_id` suffix); the migration in
 * src/migrations/20261013_120000_shop_catalogue.ts creates exactly these.
 *
 * `admin.condition` functions are shipped to the browser as source text, so each one must be
 * self-contained: no imports, no outer variables.
 */

const PRICE_ADMIN = { Field: '@/features/ecommerce/admin/PriceInput#PriceInput' }

/** The product type picker. Everything below shows or hides from this value. */
export const productTypeField: Field = {
  name: 'productType',
  type: 'select',
  defaultValue: 'simple',
  admin: { description: 'Simple: one price. Variable: options such as size or colour, each with its own price and stock. Grouped: a set of related products. External: sold on another site. Gift card: the buyer chooses an amount and the card is emailed to the recipient (set amounts in Shop settings > Gift cards).' },
  options: [
    { label: 'Simple product', value: 'simple' },
    { label: 'Variable product', value: 'variable' },
    { label: 'Grouped product', value: 'grouped' },
    { label: 'External / affiliate product', value: 'external' },
    { label: 'Gift card', value: 'giftcard' },
  ],
}

const stockStatusOptions = [
  { label: 'In stock', value: 'instock' },
  { label: 'Out of stock', value: 'outofstock' },
  { label: 'On backorder', value: 'onbackorder' },
]

const backorderOptions = [
  { label: 'Do not allow', value: 'no' },
  { label: 'Allow, but notify the customer', value: 'notify' },
  { label: 'Allow', value: 'yes' },
]

/** Identifiers, pricing, sale schedule. */
export const pricingFields: Field[] = [
  {
    type: 'collapsible',
    label: 'Pricing',
    admin: { condition: (data) => data?.productType !== 'grouped' },
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'sku', type: 'text', index: true, admin: { width: '50%', description: 'Stock keeping unit. Must be unique across products and variations.' } },
          { name: 'gtin', type: 'text', admin: { width: '50%', description: 'GTIN, UPC or EAN barcode number (digits only).' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'salePrice', type: 'number', min: 0, admin: { width: '34%', components: PRICE_ADMIN, description: 'Optional. Must be lower than the regular price.' } },
          { name: 'saleFrom', type: 'date', admin: { width: '33%', date: { pickerAppearance: 'dayAndTime' }, description: 'Leave blank to start now.' } },
          { name: 'saleTo', type: 'date', admin: { width: '33%', date: { pickerAppearance: 'dayAndTime' }, description: 'Leave blank to run until removed.' } },
        ],
      },
    ],
  },
]

export const inventoryFields: Field[] = [
  {
    type: 'collapsible',
    label: 'Stock',
    admin: { condition: (data) => data?.productType !== 'grouped' && data?.productType !== 'external' },
    fields: [
      { name: 'manageStock', type: 'checkbox', defaultValue: false, admin: { description: 'Track a quantity for this product. For a variable product, tick it on each variation instead (or here to share one stock pool).' } },
      {
        type: 'row',
        fields: [
          { name: 'stockQty', type: 'number', defaultValue: 0, admin: { width: '34%', condition: (data) => Boolean(data?.manageStock) } },
          { name: 'backorders', type: 'select', defaultValue: 'no', options: backorderOptions, admin: { width: '33%', condition: (data) => Boolean(data?.manageStock) } },
          { name: 'lowStockThreshold', type: 'number', min: 0, admin: { width: '33%', condition: (data) => Boolean(data?.manageStock), description: 'Email when stock falls to this number or lower (default 2).' } },
        ],
      },
      {
        name: 'stockStatus',
        type: 'select',
        defaultValue: 'instock',
        options: stockStatusOptions,
        admin: { description: 'Worked out from the quantity when stock is managed; otherwise set it here.' },
      },
    ],
  },
]

export const shippingFields: Field[] = [
  {
    type: 'collapsible',
    label: 'Shipping and tax',
    admin: { condition: (data) => data?.productType !== 'external' && data?.productType !== 'grouped' },
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'isVirtual', type: 'checkbox', defaultValue: false, admin: { width: '50%', description: 'No shipping needed (a service or booking).' } },
          { name: 'isDownloadable', type: 'checkbox', defaultValue: false, admin: { width: '50%', description: 'The customer receives files after buying.' } },
        ],
      },
      {
        type: 'row',
        admin: { condition: (data) => !data?.isVirtual },
        fields: [
          { name: 'weight', type: 'number', min: 0, admin: { width: '25%', description: 'kg' } },
          { name: 'length', type: 'number', min: 0, admin: { width: '25%', description: 'cm' } },
          { name: 'width', type: 'number', min: 0, admin: { width: '25%', description: 'cm' } },
          { name: 'height', type: 'number', min: 0, admin: { width: '25%', description: 'cm' } },
        ],
      },
      { name: 'shippingClass', type: 'relationship', relationTo: 'shipping-classes', admin: { condition: (data) => !data?.isVirtual, description: 'Used by shipping zones to choose a rate.' } },
      {
        type: 'row',
        fields: [
          {
            name: 'taxClass',
            type: 'select',
            defaultValue: 'standard',
            options: [
              { label: 'Standard rate', value: 'standard' },
              { label: 'Reduced rate', value: 'reduced' },
              { label: 'Zero rate', value: 'zero' },
            ],
            admin: { width: '50%' },
          },
          { name: 'taxClassOther', type: 'text', admin: { width: '50%', description: 'Optional custom class name; overrides the choice on the left when a matching class exists.' } },
        ],
      },
    ],
  },
  {
    type: 'collapsible',
    label: 'Downloads',
    admin: { condition: (data) => Boolean(data?.isDownloadable) && data?.productType !== 'external' && data?.productType !== 'grouped' },
    fields: [
      { name: 'downloads', type: 'upload', relationTo: 'media', hasMany: true, admin: { description: 'Files the customer can download after paying.' } },
      {
        type: 'row',
        fields: [
          { name: 'downloadLimit', type: 'number', min: 0, admin: { width: '50%', description: 'Downloads allowed per file. Blank means unlimited.' } },
          { name: 'downloadExpiryDays', type: 'number', min: 0, admin: { width: '50%', description: 'Days the link stays valid. Blank means never.' } },
        ],
      },
    ],
  },
]

export const typeSpecificFields: Field[] = [
  {
    type: 'collapsible',
    label: 'External product',
    admin: { condition: (data) => data?.productType === 'external' },
    fields: [
      { name: 'externalUrl', type: 'text', admin: { description: 'Where the Buy button sends the customer.' } },
      { name: 'buttonText', type: 'text', defaultValue: 'Buy', admin: { description: 'Label of the button.' } },
    ],
  },
  {
    type: 'collapsible',
    label: 'Grouped product',
    admin: { condition: (data) => data?.productType === 'grouped' },
    fields: [{ name: 'groupedProducts', type: 'relationship', relationTo: 'products', hasMany: true, admin: { description: 'Products listed together, each with its own quantity box.' } }],
  },
]

/** Attribute rows and the variations built from them. */
export const variationFields: Field[] = [
  {
    type: 'collapsible',
    label: 'Attributes',
    admin: { condition: (data) => data?.productType === 'variable' || data?.productType === 'simple' || !data?.productType },
    fields: [
      {
        name: 'attributes',
        type: 'array',
        labels: { singular: 'Attribute', plural: 'Attributes' },
        admin: { description: 'Pick a shared attribute, or type a custom name and its values separated by "|" (for example Red | Blue | Green). Tick "Used for variations" to build options from it.', initCollapsed: true },
        fields: [
          { name: 'attribute', type: 'relationship', relationTo: 'product-attributes', admin: { description: 'Optional: a shared attribute from Product attributes (its terms are used when Values is empty).' } },
          { name: 'name', type: 'text', admin: { description: 'Custom attribute name, e.g. Colour.' } },
          { name: 'values', type: 'text', admin: { description: 'Values separated by "|".' } },
          { name: 'visible', type: 'checkbox', defaultValue: true, admin: { description: 'Show on the product page.' } },
          { name: 'forVariations', type: 'checkbox', defaultValue: false, admin: { description: 'Used for variations.' } },
        ],
      },
    ],
  },
  {
    type: 'collapsible',
    label: 'Variations',
    admin: { condition: (data) => data?.productType === 'variable' },
    fields: [
      { name: 'generateVariations', type: 'ui', admin: { components: { Field: '@/features/ecommerce/admin/GenerateVariationsField#GenerateVariationsField' } } },
      {
        name: 'variations',
        type: 'array',
        labels: { singular: 'Variation', plural: 'Variations' },
        admin: {
          description: 'Each option a customer can buy. Use "Generate variations" above to build every combination of the attributes ticked "Used for variations" (up to 100).',
          initCollapsed: true,
        },
        fields: [
          { name: 'attributeValues', type: 'text', required: true, admin: { description: 'Which option this is, e.g. Color=Red|Size=M.' } },
          { name: 'sku', type: 'text' },
          { name: 'gtin', type: 'text' },
          { name: 'priceInAUD', type: 'number', min: 0, admin: { description: 'Leave blank to use the product price.' } },
          { name: 'salePrice', type: 'number', min: 0 },
          { name: 'saleFrom', type: 'date' },
          { name: 'saleTo', type: 'date' },
          { name: 'manageStock', type: 'checkbox', defaultValue: false },
          { name: 'stockQty', type: 'number', defaultValue: 0 },
          { name: 'backorders', type: 'select', defaultValue: 'no', options: backorderOptions },
          { name: 'stockStatus', type: 'select', defaultValue: 'instock', options: stockStatusOptions },
          { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'Media ID of the image to show for this option.' } },
          { name: 'weight', type: 'number', min: 0 },
          { name: 'length', type: 'number', min: 0 },
          { name: 'width', type: 'number', min: 0 },
          { name: 'height', type: 'number', min: 0 },
          { name: 'enabled', type: 'checkbox', defaultValue: true },
        ],
      },
    ],
  },
]

export const linkedProductFields: Field[] = [
  {
    type: 'collapsible',
    label: 'Linked products',
    fields: [
      { name: 'upsells', type: 'relationship', relationTo: 'products', hasMany: true, admin: { description: 'Shown on this product page as "You may also like" (better or pricier alternatives).' } },
      { name: 'crossSells', type: 'relationship', relationTo: 'products', hasMany: true, admin: { description: 'Suggested in the cart when this product is in it.' } },
    ],
  },
]

export const ratingFields: Field[] = [
  { name: 'ratingAverage', type: 'number', admin: { readOnly: true, position: 'sidebar', description: 'Average of approved reviews.' } },
  { name: 'ratingCount', type: 'number', defaultValue: 0, admin: { readOnly: true, position: 'sidebar' } },
]

export const catalogueFields: Field[] = [
  ...pricingFields,
  ...inventoryFields,
  ...shippingFields,
  ...typeSpecificFields,
  ...variationFields,
  ...linkedProductFields,
  ...ratingFields,
]
