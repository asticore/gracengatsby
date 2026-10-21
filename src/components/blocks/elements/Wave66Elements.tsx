'use client'

import { useCart } from '@/engine/commerce/react'
import Link from 'next/link'
import React, { useState } from 'react'

import './wave66.css'

/** Wave 66 client islands: the cart button and the live cart count. Server wrappers are in Wave66Server.tsx. */

const CART = String.fromCodePoint(0x1f6d2)

export const AddToCartControl: React.FC<{ productId: number; label: string; showQuantity: boolean; disabled: boolean }> = ({ productId, label, showQuantity, disabled }) => {
  const { addItem, isLoading } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const click = async () => {
    await addItem({ product: productId }, Math.max(1, Math.min(99, qty || 1)))
    setAdded(true)
  }
  return (
    <div className="w66-atc">
      {showQuantity && (
        <input className="w66-qty" type="number" min={1} max={99} value={qty} aria-label="Quantity" disabled={disabled} onChange={(e) => setQty(Number(e.target.value))} />
      )}
      <button type="button" className="btn btn--primary" onClick={click} disabled={disabled || isLoading}>
        {disabled ? 'Out of stock' : isLoading ? 'Adding...' : label}
      </button>
      <span role="status" className="w66-note">
        {added && !isLoading ? <Link href="/cart">Added. View cart</Link> : null}
      </span>
    </div>
  )
}

export const CartLinkControl: React.FC<{ label: string; showCount: boolean }> = ({ label, showCount }) => {
  const { cart } = useCart()
  const count = cart?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0
  return (
    <Link href="/cart" className="w66-cart" aria-label={count > 0 ? `${label} (${count} items)` : label}>
      <span aria-hidden="true">{CART}</span>
      {showCount && count > 0 && <span className="w66-badge">{count}</span>}
    </Link>
  )
}
