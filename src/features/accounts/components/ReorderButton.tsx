'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { useCart } from '@/engine/commerce/react'

/** Adds every line of a past order to the cart again (current prices and stock apply at checkout). */
export const ReorderButton: React.FC<{ items: { product: number; quantity: number }[] }> = ({ items }) => {
  const { addItem } = useCart()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn"
      disabled={busy || items.length === 0}
      onClick={async () => {
        setBusy(true)
        try {
          for (const item of items) await addItem({ product: item.product }, item.quantity)
          router.push('/cart')
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Adding...' : 'Order again'}
    </button>
  )
}
