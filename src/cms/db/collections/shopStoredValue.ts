import { CreditLedger } from '@/features/ecommerce/collections/CreditLedger'
import { GiftCards } from '@/features/ecommerce/collections/GiftCards'
import { StoreCredits } from '@/features/ecommerce/collections/StoreCredits'

import { createCollectionOps } from '../generic'
import { creditLedger, giftCards, storeCredits } from '../schema/shopStoredValue'

type Doc = { id: number; updatedAt: string; createdAt: string } & Record<string, unknown>
type Page = ReturnType<ReturnType<typeof createCollectionOps>['findPaginated']>
type PageArgs = { where?: import('@/engine').Where; sort?: import('@/engine').Sort; limit?: number; page?: number; pagination?: boolean }

const giftCardOps = createCollectionOps(giftCards, GiftCards)
export const findGiftCardsPaginated = giftCardOps.findPaginated as unknown as (args?: PageArgs) => Page
export const findGiftCardByID = giftCardOps.findByID as unknown as (id: number) => Promise<Doc | null>
export const countGiftCards = giftCardOps.count
export const createGiftCard = giftCardOps.create as unknown as (data: Record<string, unknown>) => Promise<Doc>
export const updateGiftCard = giftCardOps.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<Doc | null>
export const deleteGiftCard = giftCardOps.deleteByID

const storeCreditOps = createCollectionOps(storeCredits, StoreCredits)
export const findStoreCreditsPaginated = storeCreditOps.findPaginated as unknown as (args?: PageArgs) => Page
export const findStoreCreditByID = storeCreditOps.findByID as unknown as (id: number) => Promise<Doc | null>
export const countStoreCredits = storeCreditOps.count
export const createStoreCredit = storeCreditOps.create as unknown as (data: Record<string, unknown>) => Promise<Doc>
export const updateStoreCredit = storeCreditOps.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<Doc | null>
export const deleteStoreCredit = storeCreditOps.deleteByID

const creditLedgerOps = createCollectionOps(creditLedger, CreditLedger)
export const findCreditLedgerEntriesPaginated = creditLedgerOps.findPaginated as unknown as (args?: PageArgs) => Page
export const findCreditLedgerEntryByID = creditLedgerOps.findByID as unknown as (id: number) => Promise<Doc | null>
export const countCreditLedgerEntries = creditLedgerOps.count
export const createCreditLedgerEntry = creditLedgerOps.create as unknown as (data: Record<string, unknown>) => Promise<Doc>
export const updateCreditLedgerEntry = creditLedgerOps.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<Doc | null>
export const deleteCreditLedgerEntry = creditLedgerOps.deleteByID
