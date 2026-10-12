import { CreditLedger } from '@/features/ecommerce/collections/CreditLedger'
import { GiftCards } from '@/features/ecommerce/collections/GiftCards'
import { StoreCredits } from '@/features/ecommerce/collections/StoreCredits'

import { generateTable } from './generate'

/** Tables for gift cards, store credit and the credit ledger (own file so the schema index stays small). */
export const giftCardsGenerated = generateTable(GiftCards)
export const giftCards = giftCardsGenerated.table

export const storeCreditsGenerated = generateTable(StoreCredits)
export const storeCredits = storeCreditsGenerated.table

export const creditLedgerGenerated = generateTable(CreditLedger)
export const creditLedger = creditLedgerGenerated.table
