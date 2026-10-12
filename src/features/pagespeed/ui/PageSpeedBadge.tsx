import React from 'react'

import { scoreBand } from '../types'
import './pagespeed.css'

/**
 * The "PageSpeed" list cell: the latest mobile performance score, green 90+, amber 50-89, red under 50,
 * and a dash when the page has never been tested. Server-renderable (no client state).
 */
export function PageSpeedBadge({ score, testedAt }: { score: unknown; testedAt?: unknown }) {
  const value = typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null
  if (value === null) {
    return (
      <span className="ps-badge ps-band--none" title="Never tested. Open the page and use the PageSpeed card.">
        -
      </span>
    )
  }
  const band = scoreBand(value) ?? 'poor'
  const when = typeof testedAt === 'string' && testedAt ? ` Tested ${testedAt.slice(0, 10)}.` : ''
  return (
    <span className={`ps-badge ps-band--${band}`} title={`Mobile performance score from Google PageSpeed Insights.${when} Scores vary a little between runs.`}>
      {value}
    </span>
  )
}
