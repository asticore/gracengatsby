'use client'

import React from 'react'

import { useDisplayMoney } from '@/components/DisplayCurrencyContext'
import type { PriceInfo } from '@/features/ecommerce/pricing'

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
  const money = useDisplayMoney()
  if (info.onSale && info.regular !== null && info.price !== null) {
    return (
      <>
        <s className="mr-2 opacity-50">{money(info.regular)}</s>
        {money(info.price)}
        <span className="sale-badge ml-2 text-[0.65rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">Sale</span>
      </>
    )
  }
  if (variable) return <>From {money(range.min)}</>
  return <>{money(range.min ?? fallback)}</>
}
