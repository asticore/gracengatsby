import React from 'react'

import { buildJsonLd } from '../jsonLd'
import { getSeoContext } from '../settings'

/**
 * The site-wide structured data block.
 *
 * `</` inside the JSON would close the script tag early, so it is escaped -
 * an editor pasting a URL or organisation name containing it would otherwise
 * break every page on the site.
 */
export const SeoJsonLd = async (): Promise<React.ReactElement | null> => {
  const context = await getSeoContext()
  if (!context.enabled) return null

  const graph = buildJsonLd(context)
  if (!graph) return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replaceAll('</', '<\\/') }}
    />
  )
}
