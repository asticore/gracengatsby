import type { CollectionConfig } from '@/engine'

import { shopAccess } from '../access'

export const Coupons: CollectionConfig = {
  slug: 'coupons',
  dbName: 'eg_coupons',
  labels: { singular: 'Coupon', plural: 'Coupons' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'code',
    defaultColumns: ['code', 'type', 'amount', 'usageCount', 'expiresAt', 'enabled'],
    description: 'Discount codes. Codes are lowercase and unique; shoppers can type them in any case.',
  },
  access: {
    create: shopAccess('coupons', 'create'),
    read: shopAccess('coupons', 'read'),
    update: shopAccess('coupons', 'update'),
    delete: shopAccess('coupons', 'delete'),
  },
  defaultSort: '-createdAt',
  timestamps: true,
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc }): Promise<typeof data> => {
        if (!data) return data
        if (typeof data.code === 'string') data.code = data.code.trim().toLowerCase()
        if (data.code) {
          if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(data.code as string)) {
            throw new Error('A coupon code is 2 to 40 characters: letters, numbers, dash or underscore.')
          }
          const engine = (req as { engine?: { find: (a: unknown) => Promise<{ docs: { id: number }[] }> } }).engine
          const clash = await engine?.find({ collection: 'coupons', where: { code: { equals: data.code } }, limit: 2, depth: 0, overrideAccess: true }).catch((): null => null)
          const selfId = (originalDoc as { id?: number } | undefined)?.id
          if (clash?.docs.some((d: { id: number }) => d.id !== selfId)) throw new Error(`The coupon code "${data.code}" already exists.`)
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'code', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'text' },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'percent',
      options: [
        { label: 'Percentage discount', value: 'percent' },
        { label: 'Fixed cart discount', value: 'fixed_cart' },
        { label: 'Fixed product discount', value: 'fixed_product' },
        { label: 'Free shipping', value: 'free_shipping' },
      ],
    },
    { name: 'amount', type: 'number', min: 0, admin: { description: 'Percent (e.g. 10) or dollars, by type. Not used for free shipping.' } },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'expiresAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'minSpend', type: 'number', min: 0, admin: { description: 'Dollars. Empty or 0 for no minimum.' } },
    { name: 'maxSpend', type: 'number', min: 0, admin: { description: 'Dollars. Empty or 0 for no maximum.' } },
    { name: 'usageLimit', type: 'number', min: 0, admin: { description: 'Total uses allowed. Empty or 0 for unlimited.' } },
    { name: 'usageLimitPerUser', type: 'number', min: 0, admin: { description: 'Uses per customer email. Empty or 0 for unlimited.' } },
    { name: 'usageCount', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'Counted when an order is paid.' } },
    { name: 'individualUse', type: 'checkbox', defaultValue: false, admin: { description: 'Cannot be combined with other coupons.' } },
    { name: 'excludeSaleItems', type: 'checkbox', defaultValue: false },
    { name: 'includeProducts', type: 'text', admin: { description: 'Product ids, comma separated. Empty = all products.' } },
    { name: 'excludeProducts', type: 'text', admin: { description: 'Product ids, comma separated.' } },
    { name: 'includeCategories', type: 'text', admin: { description: 'Category values, comma separated. Empty = all.' } },
    { name: 'excludeCategories', type: 'text', admin: { description: 'Category values, comma separated.' } },
  ],
}
