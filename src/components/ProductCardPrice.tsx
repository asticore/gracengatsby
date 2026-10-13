'use client'

import React from 'react'

import { useShopCurrency } from '@/components/ShopCurrencyContext'
import type { PriceInfo } from '@/features/ecommerce/pricing'
import { formatPriceInAUD } from '@/lib/formatCurrency'

/** The price text on a product card, in the shop currency. Rendered by ProductCard (a server component). */
export function ProductCardPrice({
  info,
  range,
  variable,
  fallback,
}: {
  info: PriceInfo
  range: { min: number | null; max: number | null }
  variable: boolean
  fallback?: number | null
}) {
  const currency = useShopCurrency()
  if (info.onSale && info.regular !== null && info.price !== null) {
    return (
      <>
        <s className="mr-2 opacity-50">{formatPriceInAUD(info.regular, currency)}</s>
        {formatPriceInAUD(info.price, currency)}
        <span className="sale-badge ml-2 text-[0.65rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">Sale</span>
      </>
    )
  }
  if (variable) return <>From {formatPriceInAUD(range.min, currency)}</>
  return <>{formatPriceInAUD(range.min ?? fallback, currency)}</>
}