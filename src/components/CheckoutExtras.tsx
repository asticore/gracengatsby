'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

export type QuoteField = { key: string; label: string; type: 'text' | 'textarea' | 'tel'; required: boolean; placeholder: string }
export type Quote = {
  subtotalCents: number
  discountCents: number
  shippingCents: number
  taxCents: number
  taxLines: { name: string; ratePct: number; taxCents: number }[]
  pricesIncludeTax: boolean
  totalCents: number
  shippingOptions: { id: string; title: string; costCents: number }[]
  coupon: { code: string } | null
  couponError: string | null
  fields: QuoteField[]
}

export type CheckoutInput = {
  address: Record<string, string>
  couponCode: string
  shippingOptionId: string
  checkoutFields: Record<string, string>
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`
const ADDRESS_FIELDS: [string, string][] = [
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['addressLine1', 'Address'],
  ['city', 'Suburb / city'],
  ['state', 'State'],
  ['postalCode', 'Postcode'],
  ['country', 'Country (e.g. AU)'],
]

/**
 * Address, optional fields (from Shop settings), coupon and shipping choice.
 * Every figure shown comes from /api/shop-quote; the server recomputes it all
 * again when payment starts, so nothing here is trusted.
 */
export function CheckoutExtras({ cartRef, email, onChange }: { cartRef: { id: number; secret: string } | null; email: string; onChange: (v: CheckoutInput, ready: boolean) => void }) {
  const [address, setAddress] = useState<Record<string, string>>({ country: 'AU' })
  const [coupon, setCoupon] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const [shipId, setShipId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (!cartRef) return
    try {
      const res = await fetch('/api/shop-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartID: cartRef.id, secret: cartRef.secret, address, email, couponCode: appliedCoupon, shippingOptionId: shipId }),
      })
      const body = (await res.json()) as Quote & { error?: string }
      if (!res.ok) {
        setError(body.error || 'Could not price your cart.')
        return
      }
      setError('')
      setQuote(body)
      if (body.shippingOptions.length > 0 && !body.shippingOptions.some((o) => o.id === shipId)) setShipId(body.shippingOptions[0].id)
    } catch {
      setError('Could not price your cart.')
    }
  }, [cartRef, address, email, appliedCoupon, shipId])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void refresh(), 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [refresh])

  useEffect(() => {
    const needsShip = (quote?.shippingOptions.length ?? 0) > 0
    const ready = Boolean(quote) && (!needsShip || Boolean(shipId)) && Boolean(address.addressLine1 && address.country)
    onChange({ address: { ...address, ...(values.company ? { company: values.company } : {}) }, couponCode: appliedCoupon, shippingOptionId: shipId, checkoutFields: values }, ready)
  }, [address, appliedCoupon, shipId, values, quote, onChange])

  const input = 'border border-[var(--color-line)] bg-[var(--color-cream)] p-3 text-base'
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ADDRESS_FIELDS.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-[0.85rem]">
            {label}
            <input className={input} value={address[key] ?? ''} required onChange={(e) => setAddress({ ...address, [key]: e.target.value })} />
          </label>
        ))}
      </div>
      {quote?.fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-[0.85rem]">
          {f.label}
          {f.required ? ' *' : ''}
          {f.type === 'textarea' ? (
            <textarea className={input} rows={3} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          ) : (
            <input className={input} type={f.type === 'tel' ? 'tel' : 'text'} placeholder={f.placeholder} value={values[f.key] ?? ''} required={f.required} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <input className={`${input} flex-1`} placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
        <button type="button" className="btn" onClick={() => setAppliedCoupon(coupon.trim())}>Apply</button>
      </div>
      {quote?.couponError && <p className="form-error">{quote.couponError}</p>}
      {quote && quote.shippingOptions.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[0.85rem] uppercase">Shipping</legend>
          {quote.shippingOptions.map((o) => (
            <label key={o.id} className="flex gap-2">
              <input type="radio" name="shipping" checked={shipId === o.id} onChange={() => setShipId(o.id)} /> {o.title} - {o.costCents === 0 ? 'Free' : money(o.costCents)}
            </label>
          ))}
        </fieldset>
      )}
      {quote && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt>Subtotal</dt><dd>{money(quote.subtotalCents)}</dd>
          {quote.discountCents > 0 && (<><dt>Discount ({quote.coupon?.code})</dt><dd>-{money(quote.discountCents)}</dd></>)}
          {quote.shippingOptions.length > 0 && (<><dt>Shipping</dt><dd>{money(quote.shippingCents)}</dd></>)}
          {quote.taxLines.map((t) => (<React.Fragment key={t.name + t.ratePct}><dt>{t.name} ({t.ratePct}%){quote.pricesIncludeTax ? ' included' : ''}</dt><dd>{money(t.taxCents)}</dd></React.Fragment>))}
          <dt className="font-bold">Total</dt><dd className="font-bold">{money(quote.totalCents)}</dd>
        </dl>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}