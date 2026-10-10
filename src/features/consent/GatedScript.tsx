import React from 'react'

import type { CookieCategory } from './consent'
import { gateHtml } from './gate'

export type GatedScriptProps = {
  html: string
  /** The category the code waits for. "necessary" renders it as-is. */
  category: CookieCategory
  /** Which slot it is in, kept as a data attribute for the layout and for debugging. */
  label: string
}

/**
 * Custom head or body-end code, held back until its category is granted.
 * Server component: the rewrite happens on the server, so the browser never
 * receives a runnable copy of a script it is not yet allowed to run.
 */
export const GatedScript = ({ html, category, label }: GatedScriptProps) => (
  <div data-engage-custom={label} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: gateHtml(html, category) }} />
)
