'use client'

import React, { createContext, useContext } from 'react'

import { formatDisplayAmount } from '@/features/ecommerce/lib/displayCurrencyFormat'
import { type StorefrontCurrencyState } from '@/features/ecommerce/lib/displayCurrency'
import { formatPriceInAUD } from '@/lib/formatCurrency'
import { useStoreLocale } from '@/features/uiStrings/StoreTextsContext'
import { priceLocale } from '@/features/uiStrings/publicFormat'

/**
 * Display-only currency for the storefront. The layout passes the shop currency, the shopper's
 * choice and the usable extra currencies. With no choice, `useDisplayMoney` formats exactly as the
 * shop always has. Checkout never reads this: the server charges the shop currency.
 */
const EMPTY: StorefrontCurrencyState = { base: 'AUD', selected: null, options: [] }
const DisplayCurrencyContext = createContext<StorefrontCurrencyState>(EMPTY)

export function DisplayCurrencyProvider({ state, children }: { state: StorefrontCurrencyState; children: React.ReactNode }) {
  return <DisplayCurrencyContext.Provider value={state}>{children}</DisplayCurrencyContext.Provider>
}

export function useDisplayCurrencyState(): StorefrontCurrencyState {
  return useContext(DisplayCurrencyContext)
}

/**
 * Formats a whole-unit amount (29.99) the way the shopper should see it: in the chosen display
 * currency with "approx.", or in the shop currency when no display currency is chosen.
 */
export function useDisplayMoney(): (units: number | null | undefined) => string {
  const state = useContext(DisplayCurrencyContext)
  const locale = priceLocale(useStoreLocale())
  const option = state.selected ? state.options.find((o) => o.code === state.selected) : undefined
  return (units) => (option ? formatDisplayAmount(units, option.code, option.rate, option.digits, locale) : formatPriceInAUD(units, state.base, locale))
}
