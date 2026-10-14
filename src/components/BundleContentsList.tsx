import React from 'react'

/** "Includes" list for a bundle: each product inside it and how many come in one bundle. Plain display, no state. */
export function BundleContentsList({ items }: { items: Array<{ title: string; quantity: number }> }) {
  if (items.length === 0) return null
  return (
    <div className="mb-4">
      <p className="mb-1 text-[0.8rem] uppercase tracking-[0.06em]">Includes</p>
      <ul className="m-0 list-disc pl-5 text-[0.95rem]">
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`}>
            {item.quantity > 1 ? `${item.quantity} x ` : ''}
            {item.title}
          </li>
        ))}
      </ul>
    </div>
  )
}
