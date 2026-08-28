import React from 'react'

import { getSeoContext } from '../settings'
import { AnalyticsLoader } from './AnalyticsLoader'

export type SeoScriptsProps = {
  /**
   * `head` renders the analytics loader and the custom head snippets; place it
   * as the first child of <body>. `bodyEnd` renders only the body-end
   * snippets; place it as the last child.
   */
  position?: 'head' | 'bodyEnd'
}

/**
 * `display: contents` keeps the wrapper out of the layout entirely - editor
 * snippets are usually scripts and hidden pixels, but some are visible widgets
 * that would be broken by a `hidden` container.
 */
const CustomCode: React.FC<{ html: string; label: string }> = ({ html, label }) => (
  <div data-engage-custom={label} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />
)

/**
 * Analytics and editor-supplied snippets.
 *
 * Custom code is written straight into the server-rendered HTML so the browser
 * executes it while parsing, exactly as it would if it had been pasted into a
 * hand-written page. Analytics is the opposite - deferred to the client - so
 * the consent flag can actually hold it back.
 */
export const SeoScripts = async ({ position = 'head' }: SeoScriptsProps): Promise<React.ReactElement | null> => {
  const context = await getSeoContext()
  if (!context.enabled || !context.settings) return null

  const custom = context.settings.customCode
  const analytics = context.settings.analytics

  if (position === 'bodyEnd') {
    const html = custom?.bodyEndScripts?.trim()
    return html ? <CustomCode html={html} label="body-end" /> : null
  }

  const headHtml = custom?.headScripts?.trim()

  return (
    <>
      {headHtml ? <CustomCode html={headHtml} label="head" /> : null}
      <AnalyticsLoader
        gtmContainerId={analytics?.gtmContainerId?.trim() || undefined}
        ga4MeasurementId={analytics?.ga4MeasurementId?.trim() || undefined}
        metaPixelId={analytics?.metaPixelId?.trim() || undefined}
        requireConsent={analytics?.requireCookieConsent !== false}
      />
    </>
  )
}

/** Convenience wrapper for the last child of <body>. */
export const SeoBodyScripts = async (): Promise<React.ReactElement | null> => SeoScripts({ position: 'bodyEnd' })
