'use client'

import React from 'react'
import { useField } from '@/engine/ui'
import { preorderSummary } from '@/features/ecommerce/lib/preorder'

/** Shown on an order that has pre-order lines: which items ship later, and the shop's note for them. */
export function PreorderOrderPanel() {
  const lines = useField<unknown[] | undefined>({ path: 'lineItems' })
  const text = preorderSummary(lines.value)
  if (!text) return null
  return (
    <div className="field-type" role="note" style={{ marginBottom: 16 }}>
      <strong>Pre-order</strong>
      <p style={{ marginTop: 4 }}>{text}</p>
    </div>
  )
}