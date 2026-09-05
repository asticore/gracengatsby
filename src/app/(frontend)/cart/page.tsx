'use client'

import { useCart, useCurrency } from '@/engine/commerce/react'
import Link from 'next/link'
import React from 'react'

import type { Product } from '@/engage-types'

export default function CartPage() {
  const { cart, decrementItem, incrementItem, removeItem, isLoading } = useCart()
  const { formatCurrency } = useCurrency()

  const items = cart?.items || []

  return (
    <div className="page-shell">
      <h1>Your cart</h1>

      {items.length === 0 ? (
        <p>
          Your cart is empty. <Link href="/shop">Continue shopping</Link>
        </p>
      ) : (
        <>
          <ul className="mb-8 list-none border-t border-[var(--color-line)] p-0">
            {items.map((item) => {
              const product = item.product as Product
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-6 border-b border-[var(--color-line)] py-5"
                >
                  <div>
                    <h3>{typeof product === 'object' ? product.title : 'Item'}</h3>
                    <p>
                      {typeof product === 'object' ? formatCurrency(product.priceInAUD) : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="h-7 w-7 cursor-pointer border border-[var(--color-ink)] bg-transparent"
                      onClick={() => decrementItem(item.id)}
                      disabled={isLoading}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      className="h-7 w-7 cursor-pointer border border-[var(--color-ink)] bg-transparent"
                      onClick={() => incrementItem(item.id)}
                      disabled={isLoading}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cursor-pointer border-none bg-none text-[0.85rem] underline"
                    onClick={() => removeItem(item.id)}
                    disabled={isLoading}
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center justify-between">
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
