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
  /** Per-platform consent category, from Integrations. Missing entries use the platform default. */
  categories?: Partial<Record<TrackingPlatform, 'analytics' | 'marketing'>>
}

/** Pages where tags never fire: the preview screens and any admin path. */
export function trackingSuppressed(pathname: string, adminPath: string): boolean {
  if (pathname.startsWith('/preview')) return true
  if (adminPath && (pathname === adminPath || pathname.startsWith(`${adminPath}/`))) return true
  return false
}

const CLICK_DEBOUNCE_MS = 1000

export function allowedPlatforms(
  platforms: TrackingPlatform[],
  choices: ConsentChoices,
  categories: Partial<Record<TrackingPlatform, 'analytics' | 'marketing'>> = {},
): TrackingPlatform[] {
  return platforms.filter((platform) => choices[categories[platform] ?? PLATFORM_CATEGORY[platform]])
}

/**
 * Sends one platform call to the matching global. Returns false when the
 * global is not there yet (the platform script has not been injected), so the
 * caller can queue the call and retry it. A throwing platform counts as sent:
 * retrying would only repeat the error.
 */
export function sendCall(win: Win, call: PlatformCall): boolean {
  try {
    if (call.platform === 'meta') {
      if (typeof win.fbq !== 'function') return false
      win.fbq(call.method, ...call.args)
    } else if (call.platform === 'ga4') {
      if (typeof win.gtag !== 'function') return false
      win.gtag(call.method, ...call.args)
    } else if (call.platform === 'gtm') {
      if (!Array.isArray(win.dataLayer)) return false
      win.dataLayer.push(...call.args)
    } else if (call.platform === 'tiktok') {
      if (!win.ttq || typeof win.ttq[call.method] !== 'function') return false
      win.ttq[call.method](...call.args)
    }
  } catch {
    // A platform that throws must not break the page or the other platforms.
  }
  return true
}

const RETRY_MS = 250
const RETRY_ATTEMPTS = 20

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

  // Calls whose platform script is not in place yet (for example, consent was just given and the tag is still
  // injecting). They are retried for a few seconds, then dropped, so an event is never lost to a slow script.
  const queue: Array<{ call: PlatformCall; attempts: number }> = []
  let retryTimer = 0
  const flushQueue = () => {
    retryTimer = 0
    for (let i = queue.length - 1; i >= 0; i--) {
      const item = queue[i]
      if (sendCall(win, item.call)) {
        queue.splice(i, 1)
        continue
      }
      item.attempts += 1
      if (item.attempts >= RETRY_ATTEMPTS) queue.splice(i, 1)
    }
    if (queue.length) scheduleRetry()
  }
  const scheduleRetry = () => {
    if (!retryTimer && queue.length) retryTimer = win.setTimeout(flushQueue, RETRY_MS)
  }

  const fire = (event: PublicTrackingEvent, trigger: string) => {
    const choices = effectiveChoices(getConsentState().record, options.policyVersion, !options.optIn)
    let platforms = allowedPlatforms(options.platforms, choices, options.categories)
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
    for (const call of platformCalls(event, platforms, randomId())) {
      if (!sendCall(win, call)) queue.push({ call, attempts: 0 })
    }
    scheduleRetry()
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
  const onConsent = () => {
    flushPageviews()
    scheduleRetry()
  }
  win.addEventListener(CONSENT_EVENT, onConsent)
  const unsubscribe = () => {
    win.removeEventListener(CONSENT_EVENT, onConsent)
    if (retryTimer) win.clearTimeout(retryTimer)
  }

  return () => {
    for (const timer of timers) win.clearTimeout(timer)
    for (const cleanup of cleanups) cleanup()
    unsubscribe()
  }
}
