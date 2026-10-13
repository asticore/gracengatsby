'use client'

import { useCart } from '@/engine/commerce/react'
import Link from 'next/link'
import React from 'react'

import { PayLaterMessage } from '@/components/PayLaterMessage'
import { resolveCartLine, type CatalogueProduct } from '@/features/ecommerce/catalogue'
import { formatPriceInAUD } from '@/lib/formatCurrency'
import { CartCrossSells } from '@/components/CartCrossSells'
import { useShopCurrency } from '@/components/ShopCurrencyContext'
import type { Product } from '@/engage-types'

/**
 * Was `useCurrency().formatCurrency` (real `the vendor package`
 * client hook) - dropped 2026-09-26. That real hook's formatter divides by
 * 100 (matching the real plugin's own genuinely-cents price storage), which
 * is wrong for this app's `priceInAUD` (whole currency units - see the plan
 * doc's What's-left item #12) and was silently displaying prices ~100x too
 * small. `formatPriceInAUD` (`@/lib/formatCurrency`) is the same formatter
 * every other storefront page already uses for this field.
 */
export default function CartPage() {
  const { cart, decrementItem, incrementItem, removeItem, isLoading } = useCart()
  const currency = useShopCurrency()

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
              const product = item.product as unknown as Product
              // Display only: the server prices the cart from the database (see the cart hook).
              const line = typeof product === 'object' ? resolveCartLine(product as unknown as CatalogueProduct, item.variation ?? null, 1) : null
              const unitPrice = line && line.ok ? line.unitPrice : typeof product === 'object' ? product.priceInAUD : null
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-6 border-b border-[var(--color-line)] py-5"
                >
                  <div>
                    <h3>{typeof product === 'object' ? product.title : 'Item'}</h3>
                    {line && line.ok && line.variationLabel ? <p className="opacity-70">{line.variationLabel}</p> : null}
                    <p>{formatPriceInAUD(unitPrice, currency)}</p>
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

          <CartCrossSells />
          <PayLaterMessage amountDollars={typeof cart?.subtotal === 'number' ? cart.subtotal : null} />
          <div className="flex items-center justify-between">
            <p>
              Subtotal: <strong>{formatPriceInAUD(cart?.subtotal, currency)}</strong>
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
