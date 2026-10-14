'use client'

import React from 'react'

/** A collapsed checklist of labelled orders. Ticking none means "all labelled orders not yet on a manifest". */
export function OrdersManifestPicker({
  orders,
  picked,
  onChange,
}: {
  orders: { id: number; orderNumber: string; name: string }[]
  picked: number[]
  onChange: (ids: number[]) => void
}) {
  const toggle = (id: number) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  return (
    <details className="list-toolbar-picker">
      <summary className="list-toolbar-btn" title="Tick the orders to put on this manifest. None ticked means all labelled orders.">
        {picked.length > 0 ? `${picked.length} order(s) ticked` : 'Pick orders'}
      </summary>
      {orders.length === 0 ? (
        <p>No labelled orders yet. Buy a label first.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 240, overflowY: 'auto' }}>
          {orders.map((o) => (
            <li key={o.id}>
              <label>
                <input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} /> #{o.orderNumber} - {o.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <button type="button" className="list-toolbar-btn" onClick={() => onChange([])}>Clear ticks</button>
      )}
    </details>
  )
}
