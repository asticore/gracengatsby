import React from 'react'

/** Offers from the shop's live pricing rules, shown under the quantity box. Empty when there are none. */
export function PricingRuleNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <ul className="mb-3 list-none p-0 text-[0.9rem]">
      {notes.map((note) => (
        <li key={note} className="opacity-80">
          {note}
        </li>
      ))}
    </ul>
  )
}
