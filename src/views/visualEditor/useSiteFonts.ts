import { useEffect, useState } from 'react'

export type SiteFont = { family: string; cssVar?: string }

let cache: Promise<SiteFont[]> | null = null

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

export function loadSiteFonts(fetchImpl: typeof fetch = fetch): Promise<SiteFont[]> {
  if (!cache) {
    cache = fetchImpl('/api/editor-fonts', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then(parseSiteFonts)
      .catch((): SiteFont[] => [])
  }
  return cache
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
