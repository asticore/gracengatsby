import { useEffect, useState } from 'react'

export type SiteFont = { family: string; cssVar?: string }

/** Everything the canvas needs so ANY installed family previews live, not only the heading/body font. */
export type SiteFontAssets = { fonts: SiteFont[]; css: string; stylesheets: string[] }

const EMPTY_ASSETS: SiteFontAssets = { fonts: [], css: '', stylesheets: [] }
const GOOGLE_CSS_PREFIX = 'https://fonts.googleapis.com/css2?'

let cache: Promise<SiteFontAssets> | null = null

/** Parses the editor-fonts response: families, @font-face css, and Google stylesheet urls (https Google only). */
export function parseSiteFontAssets(json: unknown): SiteFontAssets {
  const raw = (json ?? {}) as { css?: unknown; stylesheets?: unknown }
  const stylesheets = Array.isArray(raw.stylesheets)
    ? raw.stylesheets.filter((u): u is string => typeof u === 'string' && u.startsWith(GOOGLE_CSS_PREFIX) && !/[\s"'<>]/.test(u))
    : []
  return { fonts: parseSiteFonts(json), css: typeof raw.css === 'string' ? raw.css : '', stylesheets }
}

/** Adds the link/style tags for every installed font to a document head. Idempotent; returns a cleanup. */
export function injectSiteFontAssets(doc: Document, assets: SiteFontAssets): () => void {
  const added: Element[] = []
  for (const href of assets.stylesheets) {
    if (Array.from(doc.head.querySelectorAll('link[data-ve-site-font]')).some((l) => l.getAttribute('data-ve-site-font') === href)) continue
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-ve-site-font', href)
    doc.head.appendChild(link)
    added.push(link)
  }
  if (assets.css && !doc.head.querySelector('style[data-ve-site-font-css]')) {
    const style = doc.createElement('style')
    style.setAttribute('data-ve-site-font-css', '1')
    style.textContent = assets.css
    doc.head.appendChild(style)
    added.push(style)
  }
  return () => {
    for (const el of added) el.remove()
  }
}

/** Parses the editor-fonts response, keeping only entries with a string family. */
export function parseSiteFonts(json: unknown): SiteFont[] {
  const list = (json as { fonts?: unknown } | null)?.fonts
  if (!Array.isArray(list)) return []
  const out: SiteFont[] = []
  for (const item of list) {
    const { family, cssVar } = (item ?? {}) as { family?: unknown; cssVar?: unknown }
    if (typeof family === 'string' && family.trim()) out.push({ family, ...(typeof cssVar === 'string' ? { cssVar } : {}) })
  }
  return out
}

export function loadSiteFontAssets(fetchImpl: typeof fetch = fetch): Promise<SiteFontAssets> {
  if (!cache) {
    cache = fetchImpl('/api/editor-fonts', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then(parseSiteFontAssets)
      .catch((): SiteFontAssets => EMPTY_ASSETS)
  }
  return cache
}

export function loadSiteFonts(fetchImpl: typeof fetch = fetch): Promise<SiteFont[]> {
  return loadSiteFontAssets(fetchImpl).then((a) => a.fonts)
}

/** Test hook: forget the cached result. */
export function resetSiteFontsCache(): void {
  cache = null
}

/** Site-installed font families for the Design panel; [] until loaded or on any failure. */
export function useSiteFonts(): SiteFont[] {
  const [fonts, setFonts] = useState<SiteFont[]>([])
  useEffect(() => {
    let live = true
    void loadSiteFonts().then((f) => {
      if (live) setFonts(f)
    })
    return () => {
      live = false
    }
  }, [])
  return fonts
}

/** Canvas side: loads every installed font into this document so any family picked in the Family select previews live. */
export function useInjectSiteFonts(): void {
  useEffect(() => {
    let live = true
    let undo: (() => void) | null = null
    void loadSiteFontAssets().then((assets) => {
      if (live) undo = injectSiteFontAssets(document, assets)
    })
    return () => {
      live = false
      undo?.()
    }
  }, [])
}