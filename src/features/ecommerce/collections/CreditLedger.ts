import type { CollectionConfig, CollectionSlug } from '@/engine'

import { shopAccess } from '../access'

/**
 * Every movement of stored value: gift card issued, spent or refunded to, store credit added, deducted,
 * spent or refunded to. Written only by the server; rows are never edited or deleted (the audit trail).
 */
export const CreditLedger: CollectionConfig = {
  slug: 'credit-ledger',
  dbName: 'eg_credit_ledger',
  labels: { singular: 'Ledger entry', plural: 'Credit ledger' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'reason',
    defaultColumns: ['kind', 'direction', 'amount', 'balanceAfter', 'reason', 'createdAt'],
    description: 'Every gift card and store credit movement, with the reason. Read-only.',
  },
  access: {
    create: () => false,
    read: shopAccess('credit-ledger', 'read'),
    update: () => false,
    delete: () => false,
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Gift card', value: 'gift-card' },
        { label: 'Store credit', value: 'store-credit' },
      ],
    },
    {
      name: 'direction',
      type: 'select',
      required: true,
      options: [
        { label: 'Credit (added)', value: 'credit' },
        { label: 'Debit (used or removed)', value: 'debit' },
      ],
    },
    { name: 'amount', type: 'number', required: true, admin: { description: 'Cents, always positive.' } },
    { name: 'balanceAfter', type: 'number', admin: { description: 'Cents left after this movement.' } },
    { name: 'reason', type: 'text' },
    { name: 'giftCard', type: 'relationship', relationTo: 'gift-cards' as CollectionSlug, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', index: true },
    { name: 'order', type: 'relationship', relationTo: 'orders' as CollectionSlug },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
}
