'use client'

import React, { useEffect, useState } from 'react'

import { messagesFromPublicConfig, publicPaymentConfig } from '@/features/ecommerce/lib/paymentMethods'

type PublicConfig = ReturnType<typeof publicPaymentConfig>

let cached: Promise<PublicConfig | null> | null = null

function loadConfig(): Promise<PublicConfig | null> {
  if (!cached) {
    cached = fetch('/api/shop-payment-config')
      .then((r) => (r.ok ? (r.json() as Promise<PublicConfig>) : null))
      .catch((): PublicConfig | null => null)
  }
  return cached
}

/** "Or 4 payments of $12.50 with Afterpay", shown only when the shop switched messaging on and the amount is in range. */
export function PayLaterMessage({ amountDollars, country = 'AU' }: { amountDollars: number | null | undefined; country?: string }) {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  useEffect(() => {
    let live = true
    loadConfig().then((c) => {
      if (live) setConfig(c)
    })
    return () => {
      live = false
    }
  }, [])
  if (!config || typeof amountDollars !== 'number' || !(amountDollars > 0)) return null
  const lines = messagesFromPublicConfig(config, Math.round(amountDollars * 100), country)
  if (lines.length === 0) return null
  return (
    <div className="mb-2 text-[0.85rem] opacity-80" data-pay-later>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  )
}
