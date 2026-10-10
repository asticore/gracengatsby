'use client'

/**
 * Makes an installed (or about-to-be-installed) font render inside the admin
 * screens, so pickers and previews show the real face. Idempotent: calling it
 * again for the same id updates the existing <style>/<link> in place.
 *
 * Only DOM writes happen here - no React state - so it is safe to call from an
 * effect or an event handler.
 */
import { buildFontCss, googleStylesheetUrl } from '@/features/fonts/css'
import { sanitizeInstalledFonts } from '@/features/fonts/installed'
import type { InstalledFont } from '@/features/fonts/types'

const STYLE_PREFIX = 'fm-font-style-'
const LINK_PREFIX = 'fm-font-link-'

export function loadFontInAdmin(font: InstalledFont): void {
  if (typeof document === 'undefined') return
  const [safe] = sanitizeInstalledFonts([font])
  if (!safe) return

  const css = buildFontCss([safe])
  const styleId = `${STYLE_PREFIX}${safe.id}`
  let style = document.getElementById(styleId) as HTMLStyleElement | null
  if (css) {
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    style.textContent = css
  } else if (style) {
    style.remove()
  }

  const linkId = `${LINK_PREFIX}${safe.id}`
  let link = document.getElementById(linkId) as HTMLLinkElement | null
  if (safe.source === 'google' && !safe.local) {
    const href = googleStylesheetUrl(safe)
    if (!link) {
      link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href)
  } else if (link) {
    link.remove()
  }
}
