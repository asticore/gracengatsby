'use client'

import { useStoreText } from '@/features/uiStrings/StoreTextsContext'
import Image from 'next/image'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import type { WishlistCard } from '@/features/ecommerce/lib/wishlistCards'
import { useWishlist } from '@/features/ecommerce/lib/useWishlist'
import { formatPriceInAUD } from '@/lib/formatCurrency'

type Loaded = { key: string; cards: WishlistCard[] | null }

/** The saved products. Ids come from this browser; the cards come from the public endpoint. */
export function WishlistList() {
  const t = useStoreText()
  const { ids, toggle } = useWishlist()
  const key = ids.join(',')
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!key) return
    const requested = key.split(',').map(Number)
    let active = true
    fetch('/api/shop-wishlist-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: requested }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load failed'))))
      .then((data: { products?: WishlistCard[] }) => {
        if (active) setLoaded({ key, cards: data.products ?? [] })
      })
      .catch(() => {
        if (active) setLoaded({ key, cards: null })
      })
    return () => {
      active = false
    }
  }, [key])

  if (ids.length === 0) {
    return (
      <p className="empty-state">
        Nothing saved yet. Tap the heart on a product to save it here. <Link href="/shop">Browse the shop</Link>
      </p>
    )
  }

  const current = loaded && loaded.key === key ? loaded : null
  if (!current) return <p>{t('store.loadingSaved')}</p>
  if (current.cards === null) return <p>{t('store.wishlistError')}</p>

  const cards = current.cards.filter((card) => ids.includes(card.id))
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-6 p-0 max-[700px]:grid-cols-1">
      {cards.map((card) => (
        <li key={card.id} className="border border-[var(--color-line)] bg-white">
          <Link href={`/shop/${card.slug}`} className="block">
            <div className="relative aspect-[4/5] overflow-hidden bg-[var(--color-cream-dim)]">
              {card.image ? (
                <Image src={card.image} alt={card.title} width={480} height={600} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
              ) : null}
            </div>
            <div className="p-4">
              <h2 className="text-[1.1rem]">{card.title}</h2>
              {card.price !== null && <p className="m-0 font-[family-name:var(--font-display)]">{formatPriceInAUD(card.price)}</p>}
            </div>
          </Link>
          <div className="px-4 pb-4">
            <button type="button" onClick={() => toggle(card.id)} className="text-[0.8rem] uppercase tracking-[0.06em] underline-offset-4 hover:underline">
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}