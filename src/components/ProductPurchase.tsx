'use client'

import { useCart } from '@/engine/commerce/react'
import Link from 'next/link'
import React, { useMemo, useState } from 'react'

import { GiftCardForm, type GiftCardConfig } from '@/components/GiftCardForm'
import { PayLaterMessage } from '@/components/PayLaterMessage'
import { QtyPriceFields } from '@/components/QtyPriceFields'
import { clampQuantity, validateNamedPrice } from '@/features/ecommerce/lib/qtyLimits'
import { formatPriceInAUD } from '@/lib/formatCurrency'
import { useShopCurrency } from '@/components/ShopCurrencyContext'
import type { ProductView, VariationView } from '@/features/ecommerce/storefront'

export type GroupedChild = { id: number; title: string; slug: string | null; view: ProductView }

function PriceLine({ price, regular, onSale, from }: { price: number | null; regular: number | null; onSale: boolean; from?: boolean }) {
  const currency = useShopCurrency()
  if (price === null) return null
  return (
    <p className="mb-2 font-[family-name:var(--font-display)] text-[1.5rem]">
      {onSale && regular !== null && regular > price ? (
        <>
          <s className="mr-2 opacity-50">{formatPriceInAUD(regular, currency)}</s>
          <span>{formatPriceInAUD(price, currency)}</span>
          <span className="sale-badge ml-3 align-middle text-[0.7rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">Sale</span>
        </>
      ) : (
        <span>
          {from ? 'From ' : ''}
          {formatPriceInAUD(price, currency)}
        </span>
      )}
    </p>
  )
}

type Limits = { min: number; max: number | null }
type BuyerPrice = { enabled: boolean; suggested: number | null; minimum: number | null }

/** Quantity box plus Add to cart. The server re-checks price, stock, limits and the option; it can still say no. */
function AddControl({ productId, variationId, disabled, label = 'Add to cart', limits, buyerPrice }: { productId: number; variationId?: string | null; disabled?: boolean; label?: string; limits?: Limits; buyerPrice?: BuyerPrice }) {
  const { addItem, isLoading } = useCart()
  const min = limits?.min ?? 1
  const cap = limits?.max ?? 99
  const named = buyerPrice?.enabled ? buyerPrice : null
  const [qty, setQty] = useState(() => clampQuantity(1, { minQty: min, maxQty: cap }))
  const [priceText, setPriceText] = useState(() => (named?.suggested != null ? named.suggested.toFixed(2) : ''))
  const [message, setMessage] = useState('')
  const [added, setAdded] = useState(false)

  const add = async () => {
    setMessage('')
    let priceCents: number | undefined
    if (named) {
      const minimumCents = named.minimum != null ? Math.floor(named.minimum * 100 + 1e-9) : null
      const check = validateNamedPrice(Math.round(Number(priceText) * 100), { minPrice: minimumCents })
      if (!check.ok || check.cents == null) {
        setMessage(check.error ?? 'Please enter a valid amount.')
        return
      }
      priceCents = check.cents
    }
    const failure = await addItem({ product: productId, variation: variationId ?? null, ...(priceCents !== undefined ? { priceCents } : {}) }, clampQuantity(qty, { minQty: min, maxQty: cap }))
    if (failure) setMessage(failure)
    else setAdded(true)
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <QtyPriceFields qty={qty} onQty={setQty} min={min} max={limits?.max ?? null} buyerPrice={named} priceText={priceText} onPriceText={setPriceText} />
        <button type="button" className="btn btn--primary" onClick={add} disabled={disabled || isLoading}>
          {isLoading ? 'Adding...' : label}
        </button>
      </div>
      {message ? (
        <p role="alert" className="mt-2 text-[0.9rem] text-[#b3261e]">
          {message}
        </p>
      ) : null}
      {added && !message ? (
        <p role="status" className="mt-2">
          Added to your cart. <Link href="/cart">View cart</Link>
        </p>
      ) : null}
    </div>
  )
}

export function ProductPurchase({ productId, view, grouped = [], giftConfig }: { productId: number; view: ProductView; grouped?: GroupedChild[]; giftConfig?: GiftCardConfig }) {
  const [selection, setSelection] = useState<Record<string, string>>({})

  const chosen: VariationView | null = useMemo(() => {
    if (view.type !== 'variable' || view.options.length === 0) return null
    if (view.options.some((option) => !selection[option.name])) return null
    return view.variations.find((variation) => view.options.every((option) => (variation.attributes[option.name] ?? '').toLowerCase() === selection[option.name].toLowerCase())) ?? null
  }, [selection, view])

  if (view.type === 'giftcard') {
    return giftConfig ? <GiftCardForm productId={productId} config={giftConfig} /> : <p>Gift cards are not available right now.</p>
  }

  if (view.type === 'external') {
    return (
      <div>
        <PriceLine price={view.price} regular={view.regular} onSale={view.onSale} />
        {view.sku ? <p className="text-[0.85rem] opacity-70">SKU: {view.sku}</p> : null}
        {view.external ? (
          <a className="btn btn--primary mt-3 inline-block" href={view.external.url} target="_blank" rel="noopener noreferrer nofollow sponsored">
            {view.external.label}
          </a>
        ) : (
          <p>This product is not available right now.</p>
        )}
      </div>
    )
  }

  if (view.type === 'grouped') {
    return (
      <div>
        {grouped.length === 0 ? <p>No products in this group yet.</p> : null}
        <ul className="m-0 list-none border-t border-[var(--color-line)] p-0">
          {grouped.map((child) => (
            <li key={child.id} className="border-b border-[var(--color-line)] py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {child.slug ? <Link href={`/shop/${child.slug}`}>{child.title}</Link> : child.title}
                  <p className="text-[0.85rem] opacity-70">{child.view.stockMessage}</p>
                </div>
                <PriceLine price={child.view.price} regular={child.view.regular} onSale={child.view.onSale} />
              </div>
              {child.view.purchasable ? <AddControl productId={child.id} /> : child.view.type === 'variable' && child.slug ? <Link href={`/shop/${child.slug}`}>Choose an option</Link> : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (view.type === 'variable') {
    const shown = chosen
    return (
      <div>
        {shown ? <PriceLine price={shown.price} regular={shown.regular} onSale={shown.onSale} /> : <PriceLine price={view.priceMin} regular={null} onSale={false} from={view.priceMin !== view.priceMax} />}
        {view.options.map((option) => (
          <label key={option.name} className="mb-3 block">
            <span className="mb-1 block text-[0.8rem] uppercase tracking-[0.06em]">{option.name}</span>
            <select
              className="w-full border border-[var(--color-line)] p-2"
              value={selection[option.name] ?? ''}
              onChange={(event) => setSelection((current) => ({ ...current, [option.name]: event.target.value }))}
            >
              <option value="">Choose an option</option>
              {option.values.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
        {shown?.imageUrl ? <img src={shown.imageUrl} alt={shown.label} width={160} height={160} className="my-3 h-40 w-40 object-cover" /> : null}
        {shown ? (
          <>
            <p className="text-[0.9rem]" data-stock={shown.stockStatus}>
              {shown.stockMessage}
            </p>
            {shown.sku ? <p className="text-[0.85rem] opacity-70">SKU: {shown.sku}</p> : null}
          </>
        ) : view.options.length > 0 ? (
          <p className="text-[0.9rem] opacity-70">Choose every option to see the price and availability.</p>
        ) : (
          <p>This product is not available right now.</p>
        )}
        <AddControl productId={productId} variationId={shown?.id ?? null} disabled={!shown || !shown.purchasable} limits={view.qtyLimits} />
      </div>
    )
  }

  return (
    <div>
      <PriceLine price={view.price} regular={view.regular} onSale={view.onSale} />
      <PayLaterMessage amountDollars={view.price} />
      <p className="text-[0.9rem]" data-stock={view.stockStatus}>
        {view.stockMessage}
      </p>
      {view.sku ? <p className="text-[0.85rem] opacity-70">SKU: {view.sku}</p> : null}
      <AddControl productId={productId} disabled={!view.purchasable} limits={view.qtyLimits} buyerPrice={view.buyerPrice} />
    </div>
  )
}
