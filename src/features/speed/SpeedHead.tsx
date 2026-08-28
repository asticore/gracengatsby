import React from 'react'

import { buildRuntimeScript, runtimeConfigFor } from './runtime'
import { getSpeedSettings } from './settings'
import type { ResolvedSpeed } from './types'

/**
 * Everything this feature contributes to the document head.
 *
 * Renders nothing at all when the Speed feature is off, or when every setting
 * that would produce output is off - no empty wrappers, no marker comments.
 *
 * WHAT IS NOT HERE, AND WHY
 *
 * Several settings in the Speed global describe work this stack already does
 * during the build, and adding a runtime switch for them would be theatre:
 *
 * - Minify CSS/JS and combine CSS: the bundler already minifies both and emits
 *   one stylesheet per route. There is no unminified alternative to switch to.
 * - Preload critical CSS: the framework already emits the route's stylesheet as
 *   a render-blocking <link> in the head, which is the outcome this setting is
 *   asking for. Extracting above-the-fold CSS separately would need a build
 *   step and a headless browser - not something a runtime toggle can do.
 * - Preload fonts and font-display: swap: fonts are self-hosted through the
 *   framework's font loader, which already emits preload links for the faces a
 *   route uses and already sets `font-display: swap`. Both are on today; a
 *   toggle here could only turn them off.
 * - Remove unused CSS: the site ships one hand-written stylesheet. Deciding at
 *   request time which rules a page does not use means parsing the CSS and the
 *   DOM on every visit, which costs more than it saves and breaks anything that
 *   styles a state not present at load - open menus, modals, hover panels.
 * - Disable emoji script: nothing on this stack injects one.
 */
export async function SpeedHead({ settings }: { settings?: ResolvedSpeed } = {}) {
  const speed = settings ?? (await getSpeedSettings())
  if (!speed.enabled) return null

  const { preconnectOrigins, prefetchDns } = speed.advanced
  const runtime = runtimeConfigFor(speed)
  if (!preconnectOrigins.length && !prefetchDns.length && !runtime) return null

  return (
    <>
      {preconnectOrigins.map((origin) => (
        // crossOrigin is required for font fetches to reuse the connection;
        // without it the browser opens a second one and the hint is wasted.
        <link key={`pre-${origin}`} rel="preconnect" href={origin} crossOrigin="anonymous" />
      ))}
      {prefetchDns.map((domain) => (
        <link key={`dns-${domain}`} rel="dns-prefetch" href={domain} />
      ))}
      {runtime ? (
        <script
          // Inline and synchronous on purpose: it has to be installed before
          // the body streams in, or there is nothing left for it to intercept.
          dangerouslySetInnerHTML={{ __html: buildRuntimeScript(runtime) }}
        />
      ) : null}
    </>
  )
}

export default SpeedHead
