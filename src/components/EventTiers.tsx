import React from 'react'

import type { TierView } from '@/features/editScreens/tierSales'

/**
 * Ticket types on the event page: name, price and what is left. On a paid event the
 * numbers are for information only; the Buy ticket button sells the one ticket product.
 */
export const EventTiers: React.FC<{ tiers: TierView[]; paid: boolean }> = ({ tiers, paid }) => {
  if (tiers.length === 0) return null
  return (
    <div className="mb-6">
      <h3 className="mb-2">Ticket types</h3>
      <ul className="flex flex-col gap-3">
        {tiers.map((tier) => (
          <li key={tier.name} className="flex flex-col gap-1">
            <span className="flex flex-wrap justify-between gap-2">
              <strong>{tier.name}</strong>
              <span>{tier.priceLabel}</span>
            </span>
            {tier.description && <span className="text-[0.85rem]">{tier.description}</span>}
            {!paid && (
              <span className="text-[0.8rem] text-[rgba(20,17,15,0.6)]">
                {tier.soldOut ? 'Sold out' : tier.remaining === null ? 'Places available' : `${tier.remaining} left`}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[0.8rem] text-[rgba(20,17,15,0.6)]">
        {paid ? 'Prices are for information. Tickets are bought with the button above.' : 'Prices are for information. Booking this event is free.'}
      </p>
    </div>
  )
}