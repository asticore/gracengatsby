export type SiteEffectsConfig = {
  cursor: 'none' | 'ring' | 'dot-ring'
  scrollProgress: boolean
  revealOnScroll: boolean
  /** Hide the native pointer while the custom cursor is active. Default false; no admin column, read from settings when present. */
  hideNativeCursor: boolean
}

/** Paths that never get site-wide effects: the visual editor canvas and the admin. */
const SKIPPED = [/^\/visual-editor-canvas(\/|$)/, /^\/admin(\/|$)/]

/**
 * Reveal targets: the outermost <section>s anywhere under <main> (main > div > section included), plus direct
 * children of <main> that contain no section at all. A wrapper that holds sections is not a target itself, so
 * nothing is faded twice. Pure: takes the root.
 */
export function revealTargets(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('main section, main > *'))) {
    if (el.tagName === 'SECTION') {
      let nested = false
      for (let p = el.parentElement; p && p.tagName !== 'MAIN'; p = p.parentElement) if (p.tagName === 'SECTION') nested = true
      if (!nested) out.push(el)
    } else if (!el.querySelector('section')) {
      out.push(el)
    }
  }
  return out
}

/**
 * Reads the General settings `pageEffects` group. Returns null when effects are off, nothing is chosen, or the
 * path is the editor canvas or admin, so the layout renders nothing at all.
 */
export function siteEffectsFor(settings: unknown, path: string): SiteEffectsConfig | null {
  const g = (settings as { pageEffects?: Record<string, unknown> | null } | null)?.pageEffects
  if (!g || g.enabled !== true) return null
  if (SKIPPED.some((re) => re.test(path))) return null
  const cursor = g.cursor === 'ring' || g.cursor === 'dot-ring' ? g.cursor : 'none'
  const cfg: SiteEffectsConfig = { cursor, scrollProgress: g.scrollProgress === true, revealOnScroll: g.revealOnScroll === true, hideNativeCursor: g.hideNativeCursor === true }
  return cfg.cursor === 'none' && !cfg.scrollProgress && !cfg.revealOnScroll ? null : cfg
}
