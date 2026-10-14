'use client'

import { useEffect, useState } from 'react'

export type BundleInfo = { priceCents: number | null; available: boolean; contents: Array<{ title: string; quantity: number }> }

/** What the cart shows for each bundle in it (price, availability, contents), from /api/shop-bundles. Empty until loaded. */
export function useBundleInfo(productIds: number[]): Record<string, BundleInfo> {
  const key = productIds.join(',')
  const [result, setResult] = useState<{ key: string; data: Record<string, BundleInfo> } | null>(null)

  useEffect(() => {
    if (!key) return
    let active = true
    fetch('/api/shop-bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: key.split(',').map(Number) }),
    })
      .then((res): Promise<unknown> => (res.ok ? res.json() : Promise.resolve({})))
      .then((data: unknown) => {
        if (active) setResult({ key, data: data && typeof data === 'object' ? (data as Record<string, BundleInfo>) : {} })
      })
      .catch(() => {
        if (active) setResult({ key, data: {} })
      })
    return () => {
      active = false
    }
  }, [key])

  return key && result?.key === key ? result.data : {}
}
