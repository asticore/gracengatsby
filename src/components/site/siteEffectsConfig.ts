export type SiteEffectsConfig = {
  cursor: 'none' | 'ring' | 'dot-ring'
  scrollProgress: boolean
  revealOnScroll: boolean
}

/** Paths that never get site-wide effects: the visual editor canvas and the admin. */
const SKIPPED = [/^\/visual-editor-canvas(\/|$)/, /^\/admin(\/|$)/]

/**
 * Reads the General settings `pageEffects` group. Returns null when effects are off, nothing is chosen, or the
 * path is the editor canvas or admin, so the layout renders nothing at all.
 */
export function siteEffectsFor(settings: unknown, path: string): SiteEffectsConfig | null {
  const g = (settings as { pageEffects?: Record<string, unknown> | null } | null)?.pageEffects
  if (!g || g.enabled !== true) return null
  if (SKIPPED.some((re) => re.test(path))) return null
  const cursor = g.cursor === 'ring' || g.cursor === 'dot-ring' ? g.cursor : 'none'
  const cfg: SiteEffectsConfig = { cursor, scrollProgress: g.scrollProgress === true, revealOnScroll: g.revealOnScroll === true }
  return cfg.cursor === 'none' && !cfg.scrollProgress && !cfg.revealOnScroll ? null : cfg
}
