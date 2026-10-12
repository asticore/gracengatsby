import type { CollectionConfig } from '@/engine'

import { shopAccess } from '../access'

/**
 * One row per customer holding their store credit balance (cents). Staff see it here; changing it goes through
 * Add or deduct credit (which records a reason in the credit ledger), so the row itself is read-only.
 * A signed-in customer reads their own balance through GET /api/account-store-credit.
 */
export const StoreCredits: CollectionConfig = {
  slug: 'store-credits',
  dbName: 'eg_store_credits',
  labels: { singular: 'Store credit', plural: 'Store credit balances' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'id',
    defaultColumns: ['user', 'balance', 'updatedAt'],
    description: 'Customer account balances. To change one, use Add or deduct credit on the customer panel so the reason is recorded.',
  },
  access: {
    create: () => false,
    read: shopAccess('store-credits', 'read'),
    update: () => false,
    delete: () => false,
  },
  defaultSort: '-updatedAt',
  timestamps: true,
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, unique: true, index: true },
    { name: 'balance', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'Cents.' } },
  ],
}
