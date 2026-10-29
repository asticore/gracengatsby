/*
 * Browser side of tracking events. Attaches the listeners for each event's
 * trigger and sends the event to every connected platform whose consent
 * category is granted. Everything here is optional: a missing platform global
 * or a missing element is simply skipped, and nothing throws into the page.
 */
import { CONSENT_EVENT, effectiveChoices, type ConsentChoices } from '@/features/consent/consent'
import { getConsentState } from '@/features/consent/store'

import { domainMatches, PLATFORM_CATEGORY, platformCalls, dedupeKey, urlMatches, normalisePath, type PlatformCall, type TrackingPlatform } from './events'
import type { PublicTrackingEvent } from './publicEvent'

type Win = Window & Record<string, any>

export type TrackingRuntimeOptions = {
  events: PublicTrackingEvent[]
  /** Which platforms have a connected ID (from Integrations). */
  platforms: TrackingPlatform[]
  policyVersion: number
  optIn: boolean
}

/** Pages where tags never fire: the preview screens and any admin path. */
export function trackingSuppressed(pathname: string, adminPath: string): boolean {
  if (pathname.startsWith('/preview')) return true
  if (adminPath && (pathname === adminPath || pathname.startsWith(`${adminPath}/`))) return true
  return false
}

const CLICK_DEBOUNCE_MS = 1000

export function allowedPlatforms(platforms: TrackingPlatform[], choices: ConsentChoices): TrackingPlatform[] {
  return platforms.filter((platform) => choices[PLATFORM_CATEGORY[platform]])
}

/** Sends one platform call to the matching global, if the global exists. */
export function sendCall(win: Win, call: PlatformCall): void {
  try {
    if (call.platform === 'meta' && typeof win.fbq === 'function') win.fbq(call.method, ...call.args)
    else if (call.platform === 'ga4' && typeof win.gtag === 'function') win.gtag(call.method, ...call.args)
    else if (call.platform === 'gtm' && Array.isArray(win.dataLayer)) win.dataLayer.push(...call.args)
    else if (call.platform === 'tiktok' && win.ttq && typeof win.ttq[call.method] === 'function') win.ttq[call.method](...call.args)
  } catch {
    // A platform that throws must not break the page or the other platforms.
  }
}

/** Finds the element an event's selector names, or null if the selector is not usable on this page. */
export function matchSelector(selector: string, target: Element | null): Element | null {
  if (!target) return null
  try {
    return target.closest(selector)
  } catch {
    return null
  }
}

export function startTracking(win: Win, options: TrackingRuntimeOptions): () => void {
  const doc = win.document as Document
  const pathname = normalisePath(win.location.pathname)
  const host = win.location.hostname as string
  const timers: number[] = []
  const cleanups: Array<() => void> = []
  const firedOncePerPage = new Set<string>()
  const lastClick = new Map<string, number>()
  const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  const fire = (event: PublicTrackingEvent, trigger: string) => {
    const choices = effectiveChoices(getConsentState().record, options.policyVersion, !options.optIn)
    let platforms = allowedPlatforms(options.platforms, choices)
    // A standard PageView is already sent by the base tags on every page (fbq PageView, ttq.page, GA4 page_view),
    // so only the dataLayer receives it here. This keeps a page view from being counted twice.
    if (trigger === 'pageview' && event.platformEvent === 'PageView') platforms = platforms.filter((p) => p === 'gtm')
    if (!platforms.length) return false
    const key = dedupeKey(event, pathname, trigger)
    if (trigger === 'click' || trigger === 'submit') {
      const now = Date.now()
      if (now - (lastClick.get(key) ?? 0) < CLICK_DEBOUNCE_MS) return false
      lastClick.set(key, now)
    } else {
      if (firedOncePerPage.has(key)) return false
      firedOncePerPage.add(key)
    }
    for (const call of platformCalls(event, platforms, randomId())) sendCall(win, call)
    return true
  }

  // A pageview event fires as soon as a platform and consent are both present. The page's own tags load
  // after consent, so a page view can be late by the time the visitor clicks yes; it is then still sent once.
  const pending: PublicTrackingEvent[] = []
  for (const event of options.events) {
    if (!domainMatches(event, host) || !urlMatches(event, pathname)) continue
    if (event.triggerType === 'pageview') {
      pending.push(event)
    } else if (event.triggerType === 'click' || event.triggerType === 'submit') {
      const type = event.triggerType === 'click' ? 'click' : 'submit'
      const onEvent = (ev: Event) => {
        const selector = event.selector ?? ''
        if (!selector) return
        if (!matchSelector(selector, ev.target as Element | null)) return
        fire(event, type)
      }
      doc.addEventListener(type, onEvent, { capture: true, passive: true })
      cleanups.push(() => doc.removeEventListener(type, onEvent, { capture: true }))
    } else if (event.triggerType === 'scroll') {
      const threshold = event.scrollDepth ?? 50
      let frame = 0
      const onScroll = () => {
        if (frame) return
        frame = win.requestAnimationFrame(() => {
          frame = 0
          const total = doc.documentElement.scrollHeight - win.innerHeight
          const percent = total <= 0 ? 100 : Math.round((win.scrollY / total) * 100)
          if (percent >= threshold) fire(event, `scroll${threshold}`)
        })
      }
      win.addEventListener('scroll', onScroll, { passive: true })
      cleanups.push(() => win.removeEventListener('scroll', onScroll))
    } else if (event.triggerType === 'time') {
      timers.push(win.setTimeout(() => fire(event, 'time'), (event.timeSeconds ?? 30) * 1000))
    }
  }

  const flushPageviews = () => {
    for (const event of pending) fire(event, 'pageview')
  }
  flushPageviews()
  // Consent can arrive after the page loads: retry the page views once it does.
  const onConsent = () => flushPageviews()
  win.addEventListener(CONSENT_EVENT, onConsent)
  const unsubscribe = () => win.removeEventListener(CONSENT_EVENT, onConsent)

  return () => {
    for (const timer of timers) win.clearTimeout(timer)
    for (const cleanup of cleanups) cleanup()
    unsubscribe()
  }
}
