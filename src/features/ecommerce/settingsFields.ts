import type { Field } from '@/engine'

/**
 * Field definitions for the groups added to the shop-settings global by the Shop settings screen
 * (/admin/shop-settings). Every field's `admin.description` is shown as a tooltip beside it.
 *
 * Column names follow src/cms/db/schema/generate.ts: `<group>_<field>` in snake_case, created by
 * src/migrations/20261014_200000_shop_settings_extras.ts.
 */

export const CURRENCY_OPTIONS = [
  { label: 'Australian dollar (AUD)', value: 'AUD' },
  { label: 'New Zealand dollar (NZD)', value: 'NZD' },
  { label: 'US dollar (USD)', value: 'USD' },
  { label: 'British pound (GBP)', value: 'GBP' },
  { label: 'Euro (EUR)', value: 'EUR' },
  { label: 'Canadian dollar (CAD)', value: 'CAD' },
]

export const generalGroup: Field = {
  type: 'group',
  name: 'general',
  label: 'Currency and units',
  admin: { description: 'The basics every other shop setting builds on.' },
  fields: [
    {
      name: 'currency',
      type: 'select',
      defaultValue: 'AUD',
      options: CURRENCY_OPTIONS,
      admin: {
        description:
          'The one currency your shop sells in. Used for orders, card payments, pay-later rules, invoices and product feeds. Product prices are entered in this currency. Changing it does not convert existing prices.',
      },
    },
    {
      name: 'unitSystem',
      type: 'select',
      defaultValue: 'metric',
      options: [
        { label: 'Metric (kg, cm)', value: 'metric' },
        { label: 'Imperial (lb, in)', value: 'imperial' },
      ],
      admin: {
        description:
          'How weights and sizes are shown and typed in the admin and on product pages: kilograms and centimetres, or pounds and inches. Everything is stored in kilograms and centimetres, so switching never changes the data or what carriers receive, only the labels and the numbers you see.',
      },
    },
  ],
}

export const orderNumbersGroup: Field = {
  type: 'group',
  name: 'orderNumbers',
  label: 'Order numbers',
  admin: { description: 'The number customers see on their order, receipt and emails.' },
  fields: [
    { name: 'prefix', type: 'text', admin: { description: 'Optional text before the number, for example "GG-". Letters, numbers and dashes only.' } },
    { name: 'nextNumber', type: 'number', defaultValue: 1001, min: 1, admin: { description: 'The number the next new order gets. It counts up by one for every order. Only raise it: lowering it can create duplicate numbers.' } },
  ],
}

const toggle = (name: string, label: string, description: string, defaultValue = true): Field => ({ name, type: 'checkbox', label, defaultValue, admin: { description } })

export const invoiceGroup: Field = {
  type: 'group',
  name: 'invoice',
  label: 'Invoices and receipts',
  admin: { description: 'How printed invoices, receipts and packing slips look. Edited on the Invoices tab with a live preview.' },
  fields: [
    { name: 'logoUrl', type: 'text', admin: { description: 'Logo shown at the top. A full https:// address or a path such as /media/logo.png.' } },
    { name: 'logoHeight', type: 'number', defaultValue: 48, min: 16, max: 160, admin: { description: 'Logo height in pixels (px).' } },
    { name: 'accentColor', type: 'text', defaultValue: '#111111', admin: { description: 'Colour of the title and table lines. A hex colour such as #8a6d3b.' } },
    { name: 'textColor', type: 'text', defaultValue: '#111111', admin: { description: 'Colour of the body text. A hex colour.' } },
    { name: 'fontFamily', type: 'select', defaultValue: 'sans', options: [{ label: 'Sans-serif', value: 'sans' }, { label: 'Serif', value: 'serif' }, { label: 'Monospace', value: 'mono' }], admin: { description: 'The typeface used on the printed page.' } },
    { name: 'fontSize', type: 'number', defaultValue: 14, min: 9, max: 20, admin: { description: 'Body text size in pixels (px). 14 suits most printers.' } },
    { name: 'headerText', type: 'textarea', admin: { description: 'A message printed under the title, for example "Thank you for shopping with us".' } },
    { name: 'footerText', type: 'textarea', admin: { description: 'Printed at the bottom, for example your returns address or contact details.' } },
    { name: 'terms', type: 'textarea', admin: { description: 'Terms and conditions or payment terms printed under the totals.' } },
    { name: 'notes', type: 'textarea', admin: { description: 'A general note printed on every invoice.' } },
    toggle('showSku', 'Show SKU', 'Print each product\'s SKU under its name.'),
    toggle('showUnitPrice', 'Show unit price', 'Print the price of one item as well as the line total.'),
    toggle('showDiscount', 'Show discount column', 'Print the coupon discount taken off each line.'),
    toggle('showTax', 'Show tax', 'Print the tax column and the tax lines in the totals. Turn off for businesses not registered for GST.'),
    toggle('showShipping', 'Show shipping', 'Print the shipping method and cost in the totals.'),
    toggle('showCustomerNote', 'Show customer note', 'Print the note the customer left at checkout.'),
    toggle('showPaymentStatus', 'Show payment status', 'Print "Paid" next to the order number.'),
    {
      name: 'titleMode',
      type: 'select',
      defaultValue: 'auto',
      options: [
        { label: 'Automatic (tax invoice when GST is charged)', value: 'auto' },
        { label: 'Always a tax invoice', value: 'tax-invoice' },
        { label: 'Always an invoice', value: 'invoice' },
        { label: 'Always a receipt', value: 'receipt' },
      ],
      admin: { description: 'What the page is called. A tax invoice carries your ABN or tax number and shows GST; a receipt confirms payment received.' },
    },
    { name: 'taxInvoiceTitle', type: 'text', defaultValue: 'Tax invoice', admin: { description: 'Title used for a tax invoice.' } },
    { name: 'invoiceTitle', type: 'text', defaultValue: 'Invoice', admin: { description: 'Title used for an invoice without tax.' } },
    { name: 'receiptTitle', type: 'text', defaultValue: 'Receipt', admin: { description: 'Title used for a receipt.' } },
    { name: 'numberPrefix', type: 'text', defaultValue: 'INV-', admin: { description: 'Text before the invoice number, for example "INV-".' } },
    { name: 'nextNumber', type: 'number', defaultValue: 1, min: 1, admin: { description: 'The invoice number the next paid order gets. Counts up by one. Only raise it, so numbers are never repeated.' } },
    { name: 'numberPadding', type: 'number', defaultValue: 5, min: 0, max: 10, admin: { description: 'Minimum digits in the number: 5 turns 42 into 00042.' } },
    { name: 'paperSize', type: 'select', defaultValue: 'A4', options: [{ label: 'A4 (210 x 297 mm)', value: 'A4' }, { label: 'US Letter (8.5 x 11 in)', value: 'Letter' }], admin: { description: 'The page size used when printing.' } },
    toggle('packingSlipEnabled', 'Packing slips', 'Show the packing slip button on orders.'),
    { name: 'packingSlipNote', type: 'textarea', admin: { description: 'Printed at the bottom of every packing slip, for example return instructions.' } },
  ],
}

export const giftCardsGroup: Field = {
  type: 'group',
  name: 'giftCards',
  label: 'Gift cards and store credit',
  admin: {
    description:
      'Gift cards are stored value: a code with a balance that can be used over several orders. Store credit is a balance on a customer account. Both can pay for anything, including courses and memberships, because those are sold through the same checkout.',
  },
  fields: [
    toggle('enabled', 'Sell gift cards', 'Lets customers buy gift cards (a product of type Gift card) and enter gift card codes at checkout.'),
    toggle('storeCreditEnabled', 'Store credit', 'Lets customers apply their account store credit at checkout, and lets you add credit to a customer from their account record. Store credit belongs to a signed-in customer or member.'),
    toggle('allowCustomAmount', 'Allow custom amounts', 'Let buyers type any amount between the minimum and maximum instead of choosing a preset.'),
    { name: 'minAmount', type: 'number', defaultValue: 10, min: 1, admin: { description: 'Smallest custom gift card, in your shop currency (dollars, not cents).' } },
    { name: 'maxAmount', type: 'number', defaultValue: 500, min: 1, admin: { description: 'Largest custom gift card, in your shop currency (dollars, not cents).' } },
    { name: 'presetAmounts', type: 'text', defaultValue: '25, 50, 100', admin: { description: 'Quick-pick amounts, separated by commas, in dollars.' } },
    { name: 'expiryMonths', type: 'number', defaultValue: 0, min: 0, admin: { description: 'Months until a new gift card expires. 0 means never. Some places require gift cards to last at least 3 years; check your local rules before setting an expiry.' } },
    toggle('refundToStoreCredit', 'Offer "refund to store credit"', 'Shows a store credit option when refunding an order. The refund goes to the customer\'s account balance instead of their card. Guests without an account cannot receive store credit.'),
  ],
}

const kind = (key: string, label: string, hint: string): Field[] => [
  { name: `${key}Subject`, type: 'text', label: `${label} subject`, admin: { description: `${hint} Leave blank for the built-in text. You can use the merge fields listed under Order emails.` } },
  { name: `${key}Body`, type: 'textarea', label: `${label} message`, admin: { description: 'Leave blank for the built-in text. Merge fields: {{order_id}}, {{order_number}}, {{customer_name}}, {{order_total}}, {{status}}, {{note}}, {{carrier}}, {{tracking_number}}, {{tracking_url}}, {{site_name}}.' } },
]

export const templatesGroup: Field = {
  type: 'group',
  name: 'templates',
  label: 'Email wording',
  admin: { description: 'Edit the subject and message of each customer email. Blank means the built-in wording.' },
  fields: [
    ...kind('processing', 'Order received', 'Sent when payment arrives.'),
    ...kind('completed', 'Order complete', 'Sent when you mark the order completed.'),
    ...kind('shipped', 'Order shipped', 'Sent when you buy a label or add tracking. Add {{tracking_number}} and {{tracking_url}}.'),
    ...kind('onHold', 'Order on hold', 'Sent when an order is put on hold.'),
    ...kind('cancelled', 'Order cancelled', 'Sent when an order is cancelled.'),
    ...kind('refunded', 'Order refunded', 'Sent when a refund is issued.'),
    ...kind('failed', 'Payment failed', 'Sent when a payment does not go through (if switched on).'),
    ...kind('customerNote', 'Note to customer', 'Sent when you add a note to the customer.'),
    { name: 'giftCardSubject', type: 'text', label: 'Gift card subject', admin: { description: 'Subject of the email that delivers a gift card to its recipient. Merge fields: {{sender_name}}, {{amount}}, {{site_name}}.' } },
    { name: 'giftCardBody', type: 'textarea', label: 'Gift card message', admin: { description: 'The text above the gift card code. Merge fields: {{recipient_name}}, {{sender_name}}, {{amount}}, {{message}}, {{code}}, {{site_name}}.' } },
  ],
}

export const storefrontGroup: Field = {
  type: 'group',
  name: 'storefront',
  label: 'Cart, wishlist and feeds',
  fields: [
    toggle('crossSellsInCart', 'Show cross-sells in the cart', 'Suggest the "Cross-sells" chosen on each product (Linked products) under the cart items.'),
    toggle('wishlist', 'Wishlist', 'Show a Save for later heart on product pages. Saved items are kept in the visitor\'s browser.'),
    toggle('backInStock', 'Back-in-stock sign-up', 'Show an "Email me when it is back" form on out-of-stock products, and send the email when stock returns.'),
    toggle('feedsEnabled', 'Product feeds', 'Publish /feeds/google-merchant.xml (Google Merchant Center) and /feeds/meta-catalog.csv (Facebook and Instagram catalogue) from your published products.', false),
    { name: 'feedBrand', type: 'text', admin: { description: 'Brand name sent in the feeds. Leave blank to use the business name.' } },
    { name: 'feedGoogleCategory', type: 'text', admin: { description: 'Optional Google product category, for example "Apparel & Accessories > Clothing". Applied to every product in the Google feed.' } },
    { name: 'feedCondition', type: 'select', defaultValue: 'new', options: [{ label: 'New', value: 'new' }, { label: 'Used', value: 'used' }, { label: 'Refurbished', value: 'refurbished' }], admin: { description: 'Condition reported to Google and Meta for every product.' } },
  ],
}

/** Top-level names of the shop-settings fields each tab of the Shop settings screen shows. */
export const SHOP_TABS = {
  general: ['general', 'tax', 'orderNumbers', 'reviewsEnabled', 'lowStockEmails', 'stockEmailTo'],
  giftCards: ['giftCards'],
  checkout: ['checkoutFields', 'storefront'],
  emails: ['emails', 'templates', 'abandonedCart'],
} as const
