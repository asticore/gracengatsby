'use client'

import React, { createContext, useContext } from 'react'

/**
 * The shop's currency (shop settings, AUD by default). The storefront layout provides it once so
 * client components (cart, checkout summary, product prices) format money the same way.
 */
const ShopCurrencyContext = createContext<string>('AUD')

export function ShopCurrencyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  return <ShopCurrencyContext.Provider value={currency}>{children}</ShopCurrencyContext.Provider>
}

export function useShopCurrency(): string {
  return useContext(ShopCurrencyContext)
}
