// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { allowedPlatforms, sendCall } from '@/features/tracking/runtime'
import { domainMatches, dedupeKey, normalisePath, PLATFORM_CATEGORY, platformCalls, urlMatches, validateTrackingEvent, type TrackingEventDef } from '@/features/tracking/events'
import { toPublicEvent } from '@/features/tracking/publicEvent'
import { trackingSuppressed } from '@/features/tracking/runtime'
import { makeChoices } from '@/features/consent/consent'

const base: TrackingEventDef = { name: 'Enquiry', platformEvent: 'Lead', triggerType: 'click', selector: '#enquire' }

describe('tracking event validation', () => {
  it('accepts a click event with a selector', () => {
    expect(validateTrackingEvent(base)).toEqual([])
  })

  it('requires a selector for click and submit, not for page view', () => {
    expect(validateTrackingEvent({ ...base, selector: '' })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, triggerType: 'submit', selector: '' })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, triggerType: 'pageview', selector: '' })).toEqual([])
  })

  it('rejects selectors that are not plain CSS', () => {
    expect(validateTrackingEvent({ ...base, selector: 'a<script>' })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, selector: 'a{color:red}' })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, selector: 'x'.repeat(301) })).not.toEqual([])
  })

  it('checks names, scroll depth, time, currency and value', () => {
    expect(validateTrackingEvent({ ...base, name: '1bad' })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, name: '' })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, triggerType: 'scroll', scrollDepth: 0 })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, triggerType: 'scroll', scrollDepth: 75 })).toEqual([])
    expect(validateTrackingEvent({ ...base, triggerType: 'time', timeSeconds: 4000 })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, currency: 'usd' })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, value: -1 })).not.toEqual([])
  })

  it('rejects an unknown standard event and an unknown trigger', () => {
    expect(validateTrackingEvent({ ...base, platformEvent: 'Bogus' as never })).not.toEqual([])
    expect(validateTrackingEvent({ ...base, triggerType: 'hover' as never })).not.toEqual([])
  })
})

describe('URL and domain matching', () => {
  it('matches exact, contains and starts-with, ignoring a trailing slash', () => {
    expect(urlMatches({ urlMatchMode: 'exact', urlMatch: '/contact' }, '/contact/')).toBe(true)
    expect(urlMatches({ urlMatchMode: 'exact', urlMatch: '/contact' }, '/contact/us')).toBe(false)
    expect(urlMatches({ urlMatchMode: 'contains', urlMatch: 'shop' }, '/en/shop/tea')).toBe(true)
    expect(urlMatches({ urlMatchMode: 'starts', urlMatch: '/blog' }, '/blog/post-1')).toBe(true)
    expect(urlMatches({ urlMatchMode: 'starts', urlMatch: '/blog' }, '/news')).toBe(false)
  })

  it('treats "any" and a blank rule as every page', () => {
    expect(urlMatches({ urlMatchMode: 'any', urlMatch: null }, '/whatever')).toBe(true)
    expect(urlMatches({ urlMatchMode: undefined, urlMatch: null }, '/whatever')).toBe(true)
  })

  it('normalises paths', () => {
    expect(normalisePath('/')).toBe('/')
    expect(normalisePath('/a/b/')).toBe('/a/b')
    expect(normalisePath('a')).toBe('/a')
  })

  it('applies the domain rule, ignoring www and scheme', () => {
    expect(domainMatches({ domain: null }, 'anything.test')).toBe(true)
    expect(domainMatches({ domain: 'https://www.Example.com/' }, 'example.com')).toBe(true)
    expect(domainMatches({ domain: 'example.com' }, 'other.com')).toBe(false)
  })
})

describe('platform calls and consent gating', () => {
  const eventId = 'evt-1'

  it('maps standard events to each platform', () => {
    const calls = platformCalls({ ...base, value: 10, currency: 'USD' }, ['meta', 'ga4', 'gtm', 'tiktok'], eventId)
    const byPlatform = Object.fromEntries(calls.map((c) => [c.platform, c]))
    expect(byPlatform.meta).toEqual({ platform: 'meta', method: 'track', args: ['Lead', { value: 10, currency: 'USD' }, { eventID: eventId }] })
    expect(byPlatform.ga4).toEqual({ platform: 'ga4', method: 'event', args: ['generate_lead', { value: 10, currency: 'USD', event_id: eventId }] })
    expect(byPlatform.gtm).toEqual({ platform: 'gtm', method: 'push', args: [{ event: 'generate_lead', event_id: eventId, value: 10, currency: 'USD' }] })
    expect(byPlatform.tiktok).toEqual({ platform: 'tiktok', method: 'track', args: ['SubmitForm', { value: 10, currency: 'USD', event_id: eventId }] })
  })

  it('sends custom events under their own name', () => {
    const calls = platformCalls({ ...base, platformEvent: 'Custom', name: 'Newsletter' }, ['meta', 'ga4'], eventId)
    expect(calls.find((c) => c.platform === 'meta')).toMatchObject({ method: 'trackCustom', args: ['Newsletter', {}, { eventID: eventId }] })
    expect(calls.find((c) => c.platform === 'ga4')).toMatchObject({ args: ['Newsletter', { event_id: eventId }] })
  })

  it('sends TikTok PageView with ttq.page()', () => {
    const calls = platformCalls({ ...base, triggerType: 'pageview', platformEvent: 'PageView', selector: null }, ['tiktok'], eventId)
    expect(calls).toEqual([{ platform: 'tiktok', method: 'page', args: [] }])
  })

  it('gates each platform on its consent category', () => {
    expect(PLATFORM_CATEGORY.meta).toBe('marketing')
    expect(PLATFORM_CATEGORY.tiktok).toBe('marketing')
    expect(PLATFORM_CATEGORY.ga4).toBe('analytics')
    expect(PLATFORM_CATEGORY.gtm).toBe('analytics')
    const analyticsOnly = makeChoices({ analytics: true, marketing: false })
    expect(allowedPlatforms(['meta', 'ga4', 'gtm', 'tiktok'], analyticsOnly)).toEqual(['ga4', 'gtm'])
    expect(allowedPlatforms(['meta', 'tiktok'], makeChoices({}))).toEqual([])
    expect(allowedPlatforms(['meta', 'ga4'], makeChoices({ analytics: true, marketing: true }))).toEqual(['meta', 'ga4'])
  })

  it('sendCall never throws and skips missing globals', () => {
    const win = {} as Record<string, unknown>
    expect(() => sendCall(win as unknown as Window & Record<string, any>, { platform: 'meta', method: 'track', args: ['Lead'] })).not.toThrow()
    const seen: unknown[] = []
    sendCall({ dataLayer: seen } as never, { platform: 'gtm', method: 'push', args: [{ event: 'x' }] })
    expect(seen).toEqual([{ event: 'x' }])
    sendCall({ fbq: () => { throw new Error('boom') } } as never, { platform: 'meta', method: 'track', args: ['Lead'] })
  })

  it('dedupe key is stable per event, page and trigger', () => {
    expect(dedupeKey({ name: 'A' }, '/x/', 'click')).toBe('A|/x|click')
    expect(dedupeKey({ name: 'A' }, '/x', 'click')).toBe(dedupeKey({ name: 'A' }, '/x/', 'click'))
  })
})

describe('public event shape and suppression', () => {
  it('drops disabled and invalid rows and keeps the public fields', () => {
    expect(toPublicEvent({ name: 'Off', enabled: false, platformEvent: 'Lead', triggerType: 'click', selector: '#a' })).toBeNull()
    expect(toPublicEvent({ name: 'Bad', enabled: true, platformEvent: 'Lead', triggerType: 'click', selector: '' })).toBeNull()
    const ok = toPublicEvent({ name: 'Enquiry', enabled: true, platformEvent: 'Lead', triggerType: 'click', selector: '#a', urlMatchMode: 'exact', urlMatch: '/contact', value: 5, currency: 'GBP' })
    expect(ok).toEqual({
      name: 'Enquiry',
      platformEvent: 'Lead',
      triggerType: 'click',
      selector: '#a',
      selectorText: null,
      urlMatchMode: 'exact',
      urlMatch: '/contact',
      domain: null,
      scrollDepth: null,
      timeSeconds: null,
      value: 5,
      currency: 'GBP',
      contentName: null,
    })
  })

  it('never runs on preview or admin paths', () => {
    expect(trackingSuppressed('/preview/pages/3', '/admin')).toBe(true)
    expect(trackingSuppressed('/admin/collections/posts', '/admin')).toBe(true)
    expect(trackingSuppressed('/secret-root/x', '/secret-root')).toBe(true)
    expect(trackingSuppressed('/shop', '/admin')).toBe(false)
    expect(trackingSuppressed('/administrators', '/admin')).toBe(false)
  })
})
