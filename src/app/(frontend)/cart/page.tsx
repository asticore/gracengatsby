'use client'

import { useCart } from '@/engine/commerce/react'
import Link from 'next/link'
import React from 'react'

import { PayLaterMessage } from '@/components/PayLaterMessage'
import { resolveCartLine, type CatalogueProduct } from '@/features/ecommerce/catalogue'
import { addOnSummary, readAddOnChoices } from '@/features/ecommerce/lib/addOns'
import { CartCrossSells } from '@/components/CartCrossSells'
import { CartRecommendations } from '@/components/CartRecommendations'
import { BundleContentsList } from '@/components/BundleContentsList'
import { useBundleInfo } from '@/features/ecommerce/lib/useBundleInfo'
import { useDisplayCurrencyState, useDisplayMoney } from '@/components/DisplayCurrencyContext'
import type { Product } from '@/engage-types'
import { useStoreText } from '@/features/uiStrings/StoreTextsContext'

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
  const t = useStoreText()
  const money = useDisplayMoney()
  const displayState = useDisplayCurrencyState()

  const items = cart?.items || []
  const bundles = useBundleInfo(items.map((item) => (typeof item.product === 'object' && item.product ? Number((item.product as { id?: unknown }).id) : 0)).filter((id) => id > 0))

  return (
    <div className="page-shell">
      <h1>{t('store.yourCart')}</h1>

      {items.length === 0 ? (
        <p>
          {t('store.emptyCart')} <Link href="/shop">{t('store.continueShopping')}</Link>
        </p>
      ) : (
        <>
          <ul className="mb-8 list-none border-t border-[var(--color-line)] p-0">
            {items.map((item) => {
              const product = item.product as unknown as Product
              // Display only: the server prices the cart from the database (see the cart hook).
              const isBundle = typeof product === 'object' && product !== null && (product as unknown as { productType?: string }).productType === 'bundle'
              const bundle = isBundle ? bundles[String((product as { id: number }).id)] : undefined
              const line = typeof product === 'object' && !isBundle ? resolveCartLine(product as unknown as CatalogueProduct, item.variation ?? null, 1) : null
              const unitPrice = isBundle ? (bundle && bundle.priceCents !== null ? bundle.priceCents / 100 : null) : line && line.ok ? line.unitPrice : typeof product === 'object' ? product.priceInAUD : null
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-6 border-b border-[var(--color-line)] py-5"
                >
                  <div>
                    <h3>{typeof product === 'object' ? product.title : t('store.item')}</h3>
                    {line && line.ok && line.variationLabel ? <p className="opacity-70">{line.variationLabel}</p> : null}
                    {readAddOnChoices(item.addOns).length > 0 ? <p className="text-[0.85rem] opacity-70">{addOnSummary(readAddOnChoices(item.addOns))}</p> : null}
                    <p>{money(unitPrice)}</p>
                    {isBundle && bundle ? <BundleContentsList items={bundle.contents} /> : null}
                    {isBundle && bundle && !bundle.available ? <p role="alert" className="text-[#b3261e]">This bundle is not available right now.</p> : null}
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
          <CartRecommendations />
          <PayLaterMessage amountDollars={typeof cart?.subtotal === 'number' ? cart.subtotal : null} />
          {displayState.selected ? (
            <p className="opacity-70">Converted prices are approximate. You pay in {displayState.base} at checkout.</p>
          ) : null}
          <div className="flex items-center justify-between">
            <p>
              Subtotal: <strong>{money(cart?.subtotal)}</strong>
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
