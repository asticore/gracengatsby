'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { UiDictionary, UiStringKey } from './keys'
import { translateWith, type UiStringVars } from './t'

type StoreDictionary = Partial<UiDictionary>

const StoreTextsContext = createContext<StoreDictionary | null>(null)

/** Gives the storefront dictionary (from storeTexts on the server) to client components below it. */
export function StoreTextsProvider({ value, children }: { value: StoreDictionary; children: ReactNode }) {
  return <StoreTextsContext.Provider value={value}>{children}</StoreTextsContext.Provider>
}

/** `t('store.addToCart')`. Without a provider it returns the English text, the same as before. */
export function useStoreText(): (key: UiStringKey, vars?: UiStringVars) => string {
  const dict = useContext(StoreTextsContext)
  return (key, vars) => translateWith(dict, key, vars)
}
