/*
 * Tracking events: the pure rules shared by the admin validator, the public
 * runtime and the tests. No DOM, no database.
 *
 * A tracking event names one standard event (Meta's or GA4's, or a custom name),
 * says when it fires (a click, a form submit, a page view, a scroll depth, or
 * time on page), and says where (a CSS selector and/or a URL rule). Each event
 * is sent to every connected platform that has its consent category granted.
 */

import { stripLocalePrefix } from './urlRule'

export const STANDARD_EVENTS = [
  'PageView',
  'ViewContent',
  'AddToCart',
  'Lead',
  'Purchase',
  'CompleteRegistration',
  'Contact',
  'Search',
  'Custom',
] as const
export type StandardEvent = (typeof STANDARD_EVENTS)[number]

export const TRIGGER_TYPES = ['click', 'submit', 'pageview', 'scroll', 'time'] as const
export type TriggerType = (typeof TRIGGER_TYPES)[number]

export const URL_MATCH_MODES = ['any', 'exact', 'contains', 'starts'] as const
export type UrlMatchMode = (typeof URL_MATCH_MODES)[number]

/**
 * Where an event's value comes from, read when the event fires. `none` sends no value. `fixed` uses the value field.
 * The rest are resolved on the page: the cart, the product or order price, the quantity, or text and attributes of an
 * element (the clicked one, or `valueSelector`), or a data layer variable (`valueRef`). See valueResolve.ts.
 */
export const VALUE_SOURCES = ['none', 'fixed', 'cartTotal', 'productPrice', 'orderTotal', 'quantity', 'elementText', 'elementAttr', 'dataLayer'] as const
export type ValueSource = (typeof VALUE_SOURCES)[number]

export const TRACKING_PLATFORMS = ['meta', 'ga4', 'gtm', 'tiktok', 'dataLayer'] as const
export type TrackingPlatform = (typeof TRACKING_PLATFORMS)[number]

/** Which consent category must be granted before a platform's tags exist. */
export const PLATFORM_CATEGORY: Record<TrackingPlatform, 'analytics' | 'marketing'> = {
  meta: 'marketing',
  tiktok: 'marketing',
  ga4: 'analytics',
  gtm: 'analytics',
  dataLayer: 'analytics',
}

/** GA4 recommended event names for the standard events. */
const GA4_NAMES: Record<Exclude<StandardEvent, 'Custom'>, string> = {
  PageView: 'page_view',
  ViewContent: 'view_item',
  AddToCart: 'add_to_cart',
  Lead: 'generate_lead',
  Purchase: 'purchase',
  CompleteRegistration: 'sign_up',
  Contact: 'contact',
  Search: 'search',
}

/** TikTok standard event names. PageView is sent with ttq.page(). */
const TIKTOK_NAMES: Record<Exclude<StandardEvent, 'Custom'>, string> = {
  PageView: 'Pageview',
  ViewContent: 'ViewContent',
  AddToCart: 'AddToCart',
  Lead: 'SubmitForm',
  Purchase: 'CompletePayment',
  CompleteRegistration: 'CompleteRegistration',
  Contact: 'Contact',
  Search: 'Search',
}

export type TrackingEventDef = {
  name: string
  platformEvent: StandardEvent
  triggerType: TriggerType
  selector?: string | null
  selectorText?: string | null
  urlMatchMode?: UrlMatchMode | null
  urlMatch?: string | null
  domain?: string | null
  value?: number | null
  currency?: string | null
  valueSource?: ValueSource | null
  /** For elementAttr: the attribute name (data-price). For dataLayer: the variable name (cartValue). */
  valueRef?: string | null
  /** For elementText and elementAttr: a CSS selector for the element to read. Blank reads the clicked element. */
  valueSelector?: string | null
  contentName?: string | null
  scrollDepth?: number | null
  timeSeconds?: number | null
  enabled?: boolean | null
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_ -]{0,79}$/
const SELECTOR_MAX = 300
// A selector is typed by an admin into a CSS engine. Refuse anything that is not a plain selector shape.
const SELECTOR_RE = /^[^<>{};`]+$/

export function validateTrackingEvent(input: TrackingEventDef): string[] {
  const errors: string[] = []
  if (!input.name || !NAME_RE.test(input.name.trim())) errors.push('Name must start with a letter and use only letters, digits, spaces, dashes or underscores (max 80).')
  if (!STANDARD_EVENTS.includes(input.platformEvent)) errors.push('Choose a standard event.')
  if (!TRIGGER_TYPES.includes(input.triggerType)) errors.push('Choose a trigger.')
  if (input.triggerType === 'click' || input.triggerType === 'submit') {
    const selector = (input.selector ?? '').trim()
    if (!selector) errors.push('Click and form submit events need a CSS selector.')
    else if (selector.length > SELECTOR_MAX || !SELECTOR_RE.test(selector)) errors.push('The CSS selector is not valid.')
  }
  if (input.triggerType === 'scroll') {
    const depth = input.scrollDepth ?? 0
    if (!Number.isInteger(depth) || depth < 1 || depth > 100) errors.push('Scroll depth must be a whole number from 1 to 100.')
  }
  if (input.triggerType === 'time') {
    const seconds = input.timeSeconds ?? 0
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) errors.push('Time on page must be a whole number of seconds from 1 to 3600.')
  }
  if (input.urlMatchMode && input.urlMatchMode !== 'any' && !(input.urlMatch ?? '').trim()) errors.push('A URL rule needs a value.')
  if (input.urlMatchMode && !URL_MATCH_MODES.includes(input.urlMatchMode)) errors.push('Choose a URL match type.')
  if (input.value != null && (!Number.isFinite(input.value) || input.value < 0)) errors.push('Value must be zero or more.')
  const source = input.valueSource ?? 'none'
  if (!VALUE_SOURCES.includes(source)) errors.push('Choose a value source.')
  if (source === 'fixed' && input.value == null) errors.push('A fixed value needs an amount.')
  if (source === 'elementAttr' && !(input.valueRef ?? '').trim()) errors.push('Name the attribute to read, e.g. data-price.')
  if (source === 'dataLayer' && !/^[A-Za-z_][\w.]{0,79}$/.test((input.valueRef ?? '').trim())) errors.push('Name the data layer variable, e.g. cartValue.')
  if (input.valueSelector && (input.valueSelector.length > SELECTOR_MAX || !SELECTOR_RE.test(input.valueSelector))) errors.push('The value selector is not valid.')
  if (input.currency && !/^[A-Z]{3}$/.test(input.currency)) errors.push('Currency must be a three-letter code, e.g. USD.')
  return errors
}

/**
 * Path-level URL match. `pathname` is the page path with no query string. A language prefix on the page ("/fr/shop")
 * is ignored, so a rule for "/shop" covers every language (see urlRule.ts).
 */
export function urlMatches(def: Pick<TrackingEventDef, 'urlMatchMode' | 'urlMatch'>, pathname: string): boolean {
  const mode = def.urlMatchMode ?? 'any'
  if (mode === 'any') return true
  const rule = (def.urlMatch ?? '').trim()
  if (!rule) return false
  const path = normalisePath(stripLocalePrefix(pathname))
  const target = normalisePath(stripLocalePrefix(rule))
  if (mode === 'exact') return path === target
  if (mode === 'contains') return stripLocalePrefix(pathname).includes(rule)
  if (mode === 'starts') return path.startsWith(rule.startsWith('/') ? rule : `/${rule}`)
  return false
}

/** Trailing slashes do not change a page, so "/shop/" and "/shop" match alike. */
export function normalisePath(path: string): string {
  const withSlash = path.startsWith('/') ? path : `/${path}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') || '/' : '/'
}

/** Domain rule: the event applies only on this host (and its www. twin). Blank means every domain. */
export function domainMatches(def: Pick<TrackingEventDef, 'domain'>, host: string): boolean {
  const want = (def.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
  if (!want) return true
  return host.toLowerCase().replace(/^www\./, '') === want
}

export type PlatformCall = { platform: TrackingPlatform; method: string; args: unknown[] }

/**
 * The calls one event makes, per platform. Pure, so the runtime only has to
 * look up the globals and invoke these. Parameters are dropped when blank.
 */
export function platformCalls(def: TrackingEventDef, platforms: TrackingPlatform[], eventId: string): PlatformCall[] {
  const params: Record<string, unknown> = {}
  if (def.value != null) params.value = def.value
  if (def.currency) params.currency = def.currency
  if (def.contentName) params.content_name = def.contentName
  const isStandard = def.platformEvent !== 'Custom'
  const std = isStandard ? (def.platformEvent as Exclude<StandardEvent, 'Custom'>) : null
  const calls: PlatformCall[] = []

  for (const platform of platforms) {
    if (platform === 'meta') {
      if (std) calls.push({ platform, method: 'track', args: [std, { ...params }, { eventID: eventId }] })
      else calls.push({ platform, method: 'trackCustom', args: [def.name, { ...params }, { eventID: eventId }] })
    } else if (platform === 'ga4' || platform === 'gtm' || platform === 'dataLayer') {
      const name = std ? GA4_NAMES[std] : def.name
      if (platform === 'ga4') calls.push({ platform, method: 'event', args: [name, { ...params, event_id: eventId }] })
      else calls.push({ platform, method: 'push', args: [{ event: name, event_id: eventId, ...params }] })
    } else if (platform === 'tiktok') {
      if (std === 'PageView') calls.push({ platform, method: 'page', args: [] })
      else calls.push({ platform, method: 'track', args: [std ? TIKTOK_NAMES[std] : def.name, { ...params, event_id: eventId }] })
    }
  }
  return calls
}

/** Stable key for "this event already fired for this page view", used to dedupe repeat triggers. */
export function dedupeKey(def: Pick<TrackingEventDef, 'name'>, pathname: string, trigger: string): string {
  return `${def.name}|${normalisePath(pathname)}|${trigger}`
}
