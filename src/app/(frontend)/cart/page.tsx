'use client'

import { useCart, useCurrency } from '@payloadcms/plugin-ecommerce/client/react'
import Link from 'next/link'
import React from 'react'

import type { Product } from '@/payload-types'

export default function CartPage() {
  const { cart, decrementItem, incrementItem, removeItem, isLoading } = useCart()
  const { formatCurrency } = useCurrency()

  const items = cart?.items || []

  return (
    <div className="page-shell cart-page">
      <h1>Your cart</h1>

      {items.length === 0 ? (
        <p>
          Your cart is empty. <Link href="/shop">Continue shopping</Link>
        </p>
      ) : (
        <>
          <ul className="cart-list">
            {items.map((item) => {
              const product = item.product as Product
              return (
                <li key={item.id} className="cart-list__item">
                  <div>
                    <h3>{typeof product === 'object' ? product.title : 'Item'}</h3>
                    <p>
                      {typeof product === 'object' ? formatCurrency(product.priceInAUD) : ''}
                    </p>
                  </div>
                  <div className="cart-list__qty">
                    <button type="button" onClick={() => decrementItem(item.id)} disabled={isLoading}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => incrementItem(item.id)} disabled={isLoading}>
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cart-list__remove"
                    onClick={() => removeItem(item.id)}
                    disabled={isLoading}
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="cart-summary">
            <p>
              Subtotal: <strong>{formatCurrency(cart?.subtotal)}</strong>
            </p>
            <Link href="/checkout" className="btn btn--primary">
              Checkout
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
