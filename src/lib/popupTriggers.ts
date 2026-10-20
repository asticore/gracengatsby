/**
 * Pure decision logic for popup (display: 'modal') triggers. No DOM access here, so it is unit tested and
 * shared by the lazy client component (src/components/blocks/PopupController.tsx).
 */
import type { PopupFrequency, SectionLayout } from './sectionLayout'

export const DAY_MS = 24 * 60 * 60 * 1000

/** What was stored the last time the popup was shown to this visitor. */
export type PopupSeen = {
  /** Epoch ms of the last time it opened on its own (localStorage), if ever. */
  lastShownMs?: number
  /** True when it already opened on its own in this browser session (sessionStorage). */
  shownThisSession?: boolean
}

/** The href that opens the popup whose section anchor is `anchorId`. Null without a usable anchor. */
export function popupHref(anchorId: unknown): string | null {
  if (typeof anchorId !== 'string') return null
  const id = anchorId.trim().replace(/^#/, '')
  return /^[A-Za-z][\w:.-]{0,79}$/.test(id) ? `#popup-${id}` : null
}

/** True when an anchor's href targets this popup. */
export function hrefOpensPopup(href: string | null | undefined, anchorId: unknown): boolean {
  const expected = popupHref(anchorId)
  return expected !== null && typeof href === 'string' && href.trim() === expected
}

/** May the popup open on its own now, given the frequency setting and what the visitor has already seen? */
export function frequencyAllows(frequency: PopupFrequency | undefined, days: number | undefined, seen: PopupSeen, nowMs: number): boolean {
  if (frequency === 'session') return !seen.shownThisSession
  if (frequency === 'days') {
    const span = (days && days > 0 ? days : 1) * DAY_MS
    if (typeof seen.lastShownMs !== 'number' || !Number.isFinite(seen.lastShownMs)) return true
    // A stored time in the future (clock change) counts as not seen recently enough to trust: allow.
    return seen.lastShownMs > nowMs || nowMs - seen.lastShownMs >= span
  }
  return true
}

/** True once the page has been scrolled at least `pct` percent of the scrollable distance. */
export function scrollThresholdReached(scrollTop: number, viewportHeight: number, docHeight: number, pct: number): boolean {
  const scrollable = docHeight - viewportHeight
  if (!(pct > 0) || !Number.isFinite(scrollTop)) return false
  if (scrollable <= 0) return false
  return (scrollTop / scrollable) * 100 >= pct
}

/** Exit intent: the pointer left through the top edge of the window. */
export function isExitIntent(clientY: number, relatedTargetIsNull: boolean): boolean {
  return clientY <= 0 && relatedTargetIsNull
}

/** Crawler / automation user agents never get an auto-opened popup. */
export function isLikelyBot(userAgent: string | undefined, webdriver?: boolean): boolean {
  if (webdriver) return true
  return /bot|crawl|spider|slurp|headless|lighthouse|prerender|facebookexternalhit|bingpreview/i.test(userAgent || '')
}

export type AutoTriggers = { delaySec?: number; scrollPct?: number; exit: boolean }

/** The automatic triggers configured on a section layout (click triggers need none). */
export function autoTriggersOf(layout: SectionLayout | undefined): AutoTriggers {
  return { delaySec: layout?.popupDelay, scrollPct: layout?.popupScroll, exit: layout?.popupExit === true }
}

export function hasAutoTrigger(t: AutoTriggers): boolean {
  return t.delaySec !== undefined || t.scrollPct !== undefined || t.exit
}
