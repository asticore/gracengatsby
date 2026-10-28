'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { UiDictionary, UiStringKey } from './keys'
import { translateWith, type UiStringVars } from './t'

type StoreDictionary = Partial<UiDictionary>

const StoreTextsContext = createContext<StoreDictionary | null>(null)
const StoreLocaleContext = createContext<string | null>(null)

/** Gives the storefront dictionary and the visitor's language (null while multilingual is off) to client components below it. */
export function StoreTextsProvider({ value, locale = null, children }: { value: StoreDictionary; locale?: string | null; children: ReactNode }) {
  return (
    <StoreLocaleContext.Provider value={locale}>
      <StoreTextsContext.Provider value={value}>{children}</StoreTextsContext.Provider>
    </StoreLocaleContext.Provider>
  )
}

/** The visitor's language for number and date formatting. Null means keep the English formatting. */
export function useStoreLocale(): string | null {
  return useContext(StoreLocaleContext)
}

/** `t('store.addToCart')`. Without a provider it returns the English text, the same as before. */
export function useStoreText(): (key: UiStringKey, vars?: UiStringVars) => string {
  const dict = useContext(StoreTextsContext)
  return (key, vars) => translateWith(dict, key, vars)
}
