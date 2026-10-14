import Link from 'next/link'
import React from 'react'

import { loadSeries } from '@/features/editScreens/seriesLoad'
import { loadSiteDetails } from '@/features/site/details'
import { formatDate } from '@/features/site/format'
import { getEngine } from '@/lib/engine'

/** "Part of a series": links between the dates of a repeating event. Renders nothing for a one-off event. */
export async function EventSeries({ event }: { event: { id: number | string; seriesOf?: unknown } }) {
  const engine = await getEngine()
  const series = await loadSeries(engine, event)
  if (!series) return null
  const details = await loadSiteDetails()

  return (
    <nav aria-label="Other dates in this series" className="mt-6 text-[0.9rem]">
      <p className="mb-2 text-[0.75rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">Part of a series</p>
      <ul className="flex flex-col gap-1">
        {series.items.map((item) => {
          const current = String(item.id) === String(event.id)
          return (
            <li key={String(item.id)}>
              {current ? (
                <span aria-current="page">
                  {formatDate(item.startDate, details, { compact: true })} (this date)
                </span>
              ) : (
                <Link className="underline" href={`/events/${item.slug}`}>
                  {formatDate(item.startDate, details, { compact: true })}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
