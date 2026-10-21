import React from 'react'

import { getBlockContext } from '@/lib/blockContext'

import { AddToCartControl, CartLinkControl } from './Wave66Elements'
import './wave66.css'

/** Wave 66 shop widgets. Server components reading the product from the per-request block context (public data only). */

type P = Record<string, unknown>

export async function AddToCartElement(props: P): Promise<React.ReactElement | null> {
  const product = getBlockContext().product
  const chosen = Number(props.productId)
  const id = Number.isFinite(chosen) && chosen > 0 ? chosen : product?.id
  if (typeof id !== 'number') return null
  const fromContext = id === product?.id
  const out = fromContext && typeof product?.inventory === 'number' && product.inventory <= 0
  const label = typeof props.label === 'string' && props.label ? props.label : 'Add to cart'
  return <AddToCartControl productId={id} label={label} showQuantity={props.showQuantity === true} disabled={out} />
}

export async function CartLinkElement(props: P): Promise<React.ReactElement> {
  const label = typeof props.label === 'string' && props.label ? props.label : 'View cart'
  return <CartLinkControl label={label} showCount={props.showCount !== false} />
}

export async function ProductRatingElement(props: P): Promise<React.ReactElement | null> {
  const product = getBlockContext().product
  const count = product?.ratingCount
  const avg = product?.ratingAverage
  if (typeof count !== 'number' || count <= 0 || typeof avg !== 'number') return null
  const rounded = Math.round(avg * 2) / 2
  const star = String.fromCodePoint(0x2605)
  return (
    <p className="w66-rating" aria-label={`Rated ${avg.toFixed(1)} out of 5 from ${count} reviews`}>
      <span className="w66-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= rounded ? 'on' : n - 0.5 === rounded ? 'half' : ''}>{star}</span>
        ))}
      </span>
      {props.showCount !== false && <span className="w66-count"> {avg.toFixed(1)} ({count})</span>}
    </p>
  )
}

export const WAVE66_COMPONENTS: Record<string, React.ComponentType<P>> = {
  'add-to-cart': AddToCartElement as never,
  'cart-link': CartLinkElement as never,
  'product-rating': ProductRatingElement as never,
}
