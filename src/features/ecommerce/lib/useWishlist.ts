'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

import { parseWishlist, readWishlistRaw, toggleWishlist, WISHLIST_EVENT, WISHLIST_KEY, writeWishlistIds } from './wishlist'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === WISHLIST_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(WISHLIST_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(WISHLIST_EVENT, onChange)
  }
}

const noServerValue = (): string => ''

/** The visitor's saved product ids, kept in sync across hearts, the list page and other tabs. */
export function useWishlist(): { ids: number[]; toggle: (id: number) => void } {
  const raw = useSyncExternalStore(subscribe, readWishlistRaw, noServerValue)
  const ids = useMemo(() => parseWishlist(raw), [raw])
  const toggle = useCallback((id: number) => {
    writeWishlistIds(toggleWishlist(parseWishlist(readWishlistRaw()), id))
  }, [])
  return { ids, toggle }
}