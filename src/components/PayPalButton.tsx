'use client'

import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'

import type { CheckoutInput } from '@/components/CheckoutExtras'

/** Only what /api/shop-payment-config exposes: enabled, the public client ID and the environment. */
type PayPalPublicConfig = { clientId: string; environment: 'sandbox' | 'live'; currency: string }
type Cart = { id: number; secret: string }
type PayPalButtons = {
  render: (el: HTMLElement) => Promise<void>
}
type PayPalSdk = {
  Buttons: (options: {
    style?: { layout?: 'vertical' | 'horizontal'; label?: 'paypal' | 'checkout' | 'pay' }
    createOrder: () => Promise<string>
    onApprove: (data: { orderID: string }) => Promise<void>
    onError: (error: unknown) => void
  }) => PayPalButtons
}

let configPromise: Promise<PayPalPublicConfig | null> | null = null

/** One request per page view. Null when PayPal is off or has no client ID. */
function loadConfig(): Promise<PayPalPublicConfig | null> {
  if (!configPromise) {
    configPromise = fetch('/api/shop-payment-config')
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, unknown>>) : null))
      .then((json): PayPalPublicConfig | null => {
        const pp = json?.paypal as { enabled?: boolean; clientId?: string; environment?: string } | undefined
        if (!pp?.enabled || !pp.clientId) return null
        return { clientId: pp.clientId, environment: pp.environment === 'live' ? 'live' : 'sandbox', currency: typeof json?.currency === 'string' ? json.currency : 'AUD' }
      })
      .catch((): null => null)
  }
  return configPromise
}

const sdkCache = new Map<string, Promise<PayPalSdk>>()

/** The PayPal JS SDK, added to the page only when the checkout needs it. The client ID is the only key used here. */
function loadSdk(cfg: PayPalPublicConfig): Promise<PayPalSdk> {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&currency=${encodeURIComponent(cfg.currency)}&intent=capture`
  const cached = sdkCache.get(src)
  if (cached) return cached
  const pending = new Promise<PayPalSdk>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => {
      const sdk = (window as unknown as { paypal?: PayPalSdk }).paypal
      if (sdk) resolve(sdk)
      else reject(new Error('PayPal did not load.'))
    }
    script.onerror = () => reject(new Error('PayPal could not be reached.'))
    document.head.appendChild(script)
  })
  pending.catch(() => sdkCache.delete(src))
  sdkCache.set(src, pending)
  return pending
}

const messageOf = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback)

/**
 * "Pay with PayPal" beside the card form. Renders nothing unless PayPal is switched on and configured. The server
 * prices the order and captures the payment; this component only passes the buyer's choices and the cart ids.
 */
export const PayPalButton: React.FC<{ cartRef: Cart | null; email: string; extras: CheckoutInput | null }> = ({ cartRef, email, extras }) => {
  const router = useRouter()
  const [cfg, setCfg] = useState<PayPalPublicConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // The PayPal popup keeps the callbacks it was given, so they read the latest values from here.
  const latest = useRef({ cartRef, email, extras })

  useEffect(() => {
    latest.current = { cartRef, email, extras }
  }, [cartRef, email, extras])

  useEffect(() => {
    let alive = true
    loadConfig().then((c) => {
      if (alive) setCfg(c)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!cfg) return
    let alive = true
    loadSdk(cfg)
      .then((sdk) => {
        if (!alive || !containerRef.current) return
        return sdk
          .Buttons({
            style: { layout: 'vertical', label: 'paypal' },
            createOrder: async () => {
              const { cartRef: c, email: e, extras: x } = latest.current
              setError(null)
              if (!c) throw new Error('Your cart is empty.')
              if (!e) throw new Error('Please enter your email address first.')
              const res = await fetch('/api/shop-paypal-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cartID: c.id,
                  secret: c.secret,
                  customerEmail: e,
                  shippingAddress: x?.address,
                  billingAddress: x?.address,
                  couponCode: x?.couponCode,
                  shippingOptionId: x?.shippingOptionId,
                  checkoutFields: x?.checkoutFields,
                  giftCardCodes: x?.giftCardCodes,
                  useStoreCredit: x?.useStoreCredit,
                }),
              })
              const json = (await res.json().catch((): Record<string, unknown> => ({}))) as { paypalOrderId?: string; paidInFull?: boolean; error?: string }
              if (json.paidInFull) throw new Error('Gift cards and store credit cover this order. Use Continue to payment instead.')
              if (!res.ok || !json.paypalOrderId) throw new Error(json.error || 'Could not start PayPal.')
              return json.paypalOrderId
            },
            onApprove: async (data) => {
              const c = latest.current.cartRef
              if (!c) return
              const res = await fetch('/api/shop-paypal-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cartID: c.id, secret: c.secret, paypalOrderId: data.orderID }),
              })
              const json = (await res.json().catch((): Record<string, unknown> => ({}))) as { orderID?: number; error?: string }
              if (!res.ok) {
                setError(json.error || 'The payment could not be confirmed.')
                return
              }
              router.push(`/checkout/success${json.orderID ? `?order=${json.orderID}` : ''}`)
            },
            onError: (err) => setError(messageOf(err, 'PayPal could not complete the payment.')),
          })
          .render(containerRef.current)
      })
      .catch((err: unknown) => {
        if (alive) setError(messageOf(err, 'PayPal could not be loaded. Please use another payment method.'))
      })
    return () => {
      alive = false
    }
  }, [cfg, router])

  if (!cfg) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.85rem] uppercase tracking-[0.06em]">Or pay with PayPal</p>
      {!email && <p className="text-[0.85rem]">Enter your email address above to pay with PayPal.</p>}
      <div ref={containerRef} />
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
