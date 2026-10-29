'use client'

import { useStoreText } from '@/features/uiStrings/StoreTextsContext'
import Link from 'next/link'
import React from 'react'

import { useWishlist } from '@/features/ecommerce/lib/useWishlist'

/** Heart toggle for "Save for later". Saved state lives in the visitor's browser only. */
export function WishlistHeart({ productId, showLink = false }: { productId: number; showLink?: boolean }) {
  const t = useStoreText()
  const { ids, toggle } = useWishlist()
  const saved = ids.includes(productId)

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        aria-pressed={saved}
        aria-label={t('store.saveForLater')}
        title={t('store.saveForLater')}
        onClick={() => toggle(productId)}
        className="inline-grid h-10 w-10 place-items-center rounded-full border border-[var(--color-line)] bg-white text-[var(--color-gold)] hover:border-[var(--color-gold)]"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
          <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
        </svg>
      </button>
      {showLink && (
        <Link href="/wishlist" className="text-[0.8rem] uppercase tracking-[0.06em] text-[var(--color-gold)] underline-offset-4 hover:underline">
          View saved items
        </Link>
      )}
    </div>
  )
}