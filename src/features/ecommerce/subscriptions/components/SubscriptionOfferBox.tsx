'use client'

import React, { useState } from 'react'

type Props = { productId: number; slug: string; signedIn: boolean; priceText: string; trialText: string; feeText: string; cancelText: string }

/** The Subscribe button. Asks the server for a Stripe Checkout address and sends the shopper there. */
export function SubscriptionOfferBox({ productId, slug, signedIn, priceText, trialText, feeText, cancelText }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/shop-subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', productId }),
      })
      const body = (await res.json().catch((): Record<string, unknown> => ({}))) as { url?: string; error?: string }
      if (!res.ok || !body.url) throw new Error(body.error || 'The subscription could not be started.')
      window.location.assign(body.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The subscription could not be started.')
      setBusy(false)
    }
  }

  return (
    <section className="subscription-offer" aria-label="Subscribe to this product" style={{ marginTop: 16 }}>
      <p style={{ margin: '0 0 4px' }}>
        <strong>Subscribe</strong> and pay {priceText}.
      </p>
      {trialText ? <p style={{ margin: '0 0 4px' }}>{trialText}</p> : null}
      {feeText ? <p style={{ margin: '0 0 4px' }}>{feeText}</p> : null}
      <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.8 }}>{cancelText}</p>
      {signedIn ? (
        <button type="button" className="btn btn--primary" disabled={busy} onClick={start}>
          {busy ? 'Starting...' : 'Start subscription'}
        </button>
      ) : (
        <a href={`/account/sign-in?next=${encodeURIComponent(`/shop/${slug}`)}`}>Sign in to subscribe</a>
      )}
      {error ? (
        <p role="alert" style={{ color: 'var(--theme-error-500, #b42318)', margin: '8px 0 0' }}>
          {error}
        </p>
      ) : null}
    </section>
  )
}
