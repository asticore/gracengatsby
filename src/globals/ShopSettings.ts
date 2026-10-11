import type { GlobalConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'

export const ShopSettings: GlobalConfig = {
  slug: 'shop-settings',
  dbName: 'eg_shop_settings',
  label: 'Shop',
  admin: {
    group: 'Settings',
    description:
      'Layout for the shop archive (/shop) and product pages. Turn ecommerce on/off in Settings > Features. Click "Edit visually" above to build the intro section on a drag-and-drop canvas.',
    components: {
      elements: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'introBlocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: {
        description: 'Shown above the product grid on /shop - build it visually with "Edit visually" above.',
        initCollapsed: true,
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'archiveLayout',
          type: 'select',
          defaultValue: 'grid-4',
          admin: { width: '50%' },
          options: [
            { label: 'Grid - 3 columns', value: 'grid-3' },
            { label: 'Grid - 4 columns', value: 'grid-4' },
            { label: 'List', value: 'list' },
          ],
        },
        { name: 'showCategoryFilters', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'showRelatedProducts', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
        { name: 'showShortDescriptionOnCard', type: 'checkbox', defaultValue: false, admin: { width: '33%' } },
        { name: 'productImageAspect', type: 'select', defaultValue: 'portrait', admin: { width: '33%' }, options: [
          { label: 'Portrait', value: 'portrait' },
          { label: 'Square', value: 'square' },
        ] },
      ],
    },
    {
      type: 'group',
      name: 'tax',
      label: 'Tax (GST)',
      admin: { description: 'Prices are entered including GST by default. Add rows under Tax rates to override the store rate or tax other regions.' },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        { name: 'pricesIncludeTax', type: 'checkbox', defaultValue: true, admin: { description: 'Catalogue prices already include tax.' } },
        { name: 'displayIncludingTax', type: 'checkbox', defaultValue: true, admin: { description: 'Show prices including tax in the shop.' } },
        { name: 'defaultCountry', type: 'text', defaultValue: 'AU' },
        { name: 'storeRatePct', type: 'number', defaultValue: 10, min: 0, max: 100, admin: { description: 'GST rate for the standard class when no tax rate row matches.' } },
        { name: 'businessName', type: 'text', admin: { description: 'Printed on invoices.' } },
        { name: 'abn', type: 'text', admin: { description: 'Printed on tax invoices.' } },
        { name: 'businessAddress', type: 'textarea' },
      ],
    },
    {
      type: 'group',
      name: 'emails',
      label: 'Order emails',
      admin: { description: 'Customer emails sent through Settings > Email. Merge fields: {{order_id}}, {{customer_name}}, {{order_total}}, {{status}}, {{note}}, {{site_name}}.' },
      fields: [
        { name: 'processing', type: 'checkbox', defaultValue: true, label: 'Order received (processing)' },
        { name: 'completed', type: 'checkbox', defaultValue: true },
        { name: 'onHold', type: 'checkbox', defaultValue: true },
        { name: 'cancelled', type: 'checkbox', defaultValue: true },
        { name: 'refunded', type: 'checkbox', defaultValue: true },
        { name: 'failed', type: 'checkbox', defaultValue: false },
        { name: 'customerNote', type: 'checkbox', defaultValue: true, label: 'Customer notes' },
        { name: 'newOrderAdmin', type: 'checkbox', defaultValue: false, label: 'Notify me of new orders' },
        { name: 'adminEmail', type: 'email', access: { read: ({ req }: { req: { user?: unknown } }) => Boolean(req.user) } },
        { name: 'bodyTemplate', type: 'textarea', admin: { description: 'Optional message used for every status email. Leave empty for the built-in text.' } },
      ],
    },
    {
      type: 'group',
      name: 'abandonedCart',
      label: 'Abandoned cart emails',
      admin: { description: 'Off by default. Reminds shoppers who entered their email at checkout but did not pay.' },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'firstDelayHours', type: 'number', defaultValue: 1, min: 0.25 },
        { name: 'secondDelayHours', type: 'number', defaultValue: 24, min: 1 },
        { name: 'maxReminders', type: 'number', defaultValue: 2, min: 1, max: 2 },
        { name: 'subject', type: 'text', defaultValue: 'You left something in your cart' },
        { name: 'bodyTemplate', type: 'textarea', admin: { description: 'Optional. {{site_name}} is available; the recover and unsubscribe links are always added.' } },
      ],
    },
    {
      name: 'checkoutFields',
      type: 'array',
      labels: { singular: 'Checkout field', plural: 'Checkout fields' },
      admin: {
        description:
          'Optional checkout fields, in the order shown. Built-in keys: company, phone, addressLine2, abn, orderNotes. Add your own with a key starting custom_ (letters, numbers, underscore).',
      },
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'label', type: 'text' },
        { name: 'type', type: 'select', defaultValue: 'text', options: [{ label: 'Text', value: 'text' }, { label: 'Long text', value: 'textarea' }, { label: 'Phone', value: 'tel' }] },
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        { name: 'required', type: 'checkbox', defaultValue: false },
        { name: 'placeholder', type: 'text' },
      ],
    },
    { name: 'reviewsEnabled', type: 'checkbox', defaultValue: true, admin: { description: 'Let customers submit product reviews. Every review waits for approval under Product reviews.' } },
    { name: 'lowStockEmails', type: 'checkbox', defaultValue: true, admin: { description: 'Email when a product runs low or sells out.' } },
    { name: 'stockEmailTo', type: 'email', admin: { description: 'Where stock emails go. Leave blank to use the order notification email.' } },
  ],
}
