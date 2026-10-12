import type { CollectionConfig, CollectionSlug } from '@/engine'

import { shopAccess } from '../access'
import { generateGiftCardCode, normaliseGiftCardCode } from '../lib/storedValue'

/**
 * Gift cards: a code with a balance that can be spent over several orders. Cards bought in the shop are
 * created by the server when the order is paid (see ../server/storedValue.ts). Staff can also create one by hand
 * (a voucher, a goodwill gesture) and can limit it to one product, for example a course or a membership.
 * The balance only ever changes through atomic server statements that also write the ledger, so it is read-only here.
 */
export const GiftCards: CollectionConfig = {
  slug: 'gift-cards',
  dbName: 'eg_gift_cards',
  labels: { singular: 'Gift card', plural: 'Gift cards' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'code',
    defaultColumns: ['code', 'balance', 'status', 'recipientEmail', 'expiresAt', 'createdAt'],
    description: 'Stored value. Amounts are in cents (5000 = $50.00). A card can be spent over several orders until its balance is used up.',
  },
  access: {
    create: shopAccess('gift-cards', 'create'),
    read: shopAccess('gift-cards', 'read'),
    update: shopAccess('gift-cards', 'update'),
    delete: shopAccess('gift-cards', 'delete'),
  },
  defaultSort: '-createdAt',
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        const user = (req as { user?: unknown }).user
        if (operation === 'create') {
          const code = normaliseGiftCardCode(data.code)
          data.code = code || generateGiftCardCode()
          const initial = Number(data.initialAmount)
          if (!Number.isInteger(initial) || initial <= 0) throw new Error('Enter the card amount in cents, for example 5000 for $50.00.')
          data.balance = initial
          data.currency = typeof data.currency === 'string' && data.currency ? data.currency.toUpperCase() : 'AUD'
          if (!data.status) data.status = 'active'
        } else if (user && originalDoc) {
          // A person editing the card cannot change the code, the amounts or the order link.
          const o = originalDoc as Record<string, unknown>
          data.code = o.code
          data.balance = o.balance
          data.initialAmount = o.initialAmount
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        // Cards bought in the shop get their ledger row from issueGiftCards (they carry an order); a hand-made card needs one here.
        if (operation !== 'create' || doc.order) return doc
        const { writeLedger } = await import('../server/storedValue')
        const user = (req as { user?: { id?: number } | null }).user
        await writeLedger((req as unknown as { engine: never }).engine, {
          kind: 'gift-card',
          direction: 'credit',
          amount: Number(doc.initialAmount ?? 0),
          balanceAfter: Number(doc.balance ?? doc.initialAmount ?? 0),
          reason: 'Created by staff',
          giftCard: Number(doc.id),
          ...(user?.id ? { createdBy: Number(user.id) } : {}),
        })
        return doc
      },
    ],
  },
  fields: [
    { name: 'code', type: 'text', unique: true, index: true, admin: { description: 'Leave blank to generate one (XXXX-XXXX-XXXX-XXXX).' } },
    { name: 'initialAmount', type: 'number', required: true, min: 1, admin: { description: 'Cents.' } },
    { name: 'balance', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'Cents left. Changes only when the card is spent or refunded to.' } },
    { name: 'currency', type: 'text', defaultValue: 'AUD', admin: { position: 'sidebar' } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      index: true,
      admin: { position: 'sidebar', description: 'Pending cards wait for their send date. Disabled cards cannot be spent.' },
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Pending (waiting to be sent)', value: 'pending' },
        { label: 'Disabled', value: 'disabled' },
      ],
    },
    { name: 'expiresAt', type: 'date', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'recipientName', type: 'text' },
    { name: 'recipientEmail', type: 'email' },
    { name: 'senderName', type: 'text' },
    { name: 'message', type: 'textarea' },
    { name: 'sendAt', type: 'date', admin: { description: 'When the card is emailed to the recipient. Empty means straight away.', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'sentAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'purchaserEmail', type: 'email', admin: { readOnly: true } },
    { name: 'order', type: 'relationship', relationTo: 'orders' as CollectionSlug, admin: { position: 'sidebar', readOnly: true } },
    {
      name: 'restrictProduct',
      type: 'relationship',
      relationTo: 'products',
      admin: { position: 'sidebar', description: 'Optional. A voucher that can only pay for this product, for example one course or membership.' },
    },
    { name: 'note', type: 'textarea', admin: { description: 'Internal note.' } },
  ],
}
