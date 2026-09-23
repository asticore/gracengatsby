import type { Sort, Where } from '@/engine'

import { Transactions } from '@/features/ecommerce/collections/Transactions'

import { createCollectionOps } from '../generic'
import { transactions, transactionsGenerated, transactionsItems } from '../schema'

export type TransactionItem = { id: string; product?: number | null; quantity: number }
export type TransactionAddress = {
  title?: string | null
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
}

/** Payload's document shape for the `transactions` collection - see src/features/ecommerce/collections/Transactions.ts. No `_rels` table: `order`/`cart` are single-target relationships (plain `_id` columns), and `transactions` is never the target-side of its own hasMany field. */
export type TransactionDoc = {
  id: number
  items?: TransactionItem[] | null
  paymentMethod?: string | null
  stripe?: { customerID?: string | null; paymentIntentID?: string | null } | null
  billingAddress?: TransactionAddress | null
  status: string
  customer?: number | null
  customerEmail?: string | null
  order?: number | null
  cart?: number | null
  amount?: number | null
  currency?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(transactions, Transactions, { items: transactionsItems }, { groupFields: transactionsGenerated.groupFields })

export const findTransactions = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<TransactionDoc[]>
export const findTransactionsPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findTransactionByID = ops.findByID as unknown as (id: number) => Promise<TransactionDoc | null>
export const countTransactions = ops.count
export const createTransaction = ops.create as unknown as (
  data: Partial<Omit<TransactionDoc, 'id' | 'updatedAt' | 'createdAt'>> & { status: string },
) => Promise<TransactionDoc>
export const updateTransaction = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<TransactionDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<TransactionDoc | null>
export const deleteTransaction = ops.deleteByID
