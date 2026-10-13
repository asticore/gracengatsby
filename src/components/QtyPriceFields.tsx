import React from 'react'

export type BuyerPriceConfig = { suggested: number | null; minimum: number | null }

/**
 * Quantity box (with the product's min and max) and, for name-your-price products, a "Pay what you
 * want" box prefilled with the suggested amount. Controlled by AddControl in ProductPurchase.tsx.
 * The server re-checks both values; these limits only help the buyer get it right first time.
 */
export function QtyPriceFields({
  qty,
  onQty,
  min,
  max,
  buyerPrice,
  priceText,
  onPriceText,
}: {
  qty: number
  onQty: (qty: number) => void
  min: number
  max: number | null
  buyerPrice?: BuyerPriceConfig | null
  priceText: string
  onPriceText: (text: string) => void
}) {
  const minimumText = buyerPrice?.minimum != null ? buyerPrice.minimum.toFixed(2) : '0.01'
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="sr-only">Quantity</span>
          <input
            type="number"
            min={min}
            max={max ?? 99}
            value={qty}
            aria-label="Quantity"
            onChange={(event) => onQty(Number(event.target.value))}
            className="w-20 border border-[var(--color-line)] p-2"
          />
        </label>
        {min > 1 || max !== null ? (
          <span className="text-[0.85rem] opacity-70">
            {min > 1 ? `Minimum ${min}` : ''}
            {min > 1 && max !== null ? ', ' : ''}
            {max !== null ? `maximum ${max}` : ''}
          </span>
        ) : null}
      </div>
      {buyerPrice ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-[0.8rem] uppercase tracking-[0.06em]">Pay what you want</span>
          <span className="flex items-center gap-2">
            <span aria-hidden>$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={minimumText}
              value={priceText}
              onChange={(event) => onPriceText(event.target.value)}
              className="w-32 border border-[var(--color-line)] p-2"
            />
          </span>
          <span className="mt-1 block text-[0.85rem] opacity-70">Minimum ${minimumText}</span>
        </label>
      ) : null}
    </div>
  )
}