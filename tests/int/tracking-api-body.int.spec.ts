import { describe, expect, it } from 'vitest'

import { readTrackingEventBody, trackingEventSummary } from '@/features/tracking/apiBody'

const valid = {
  name: 'Add to cart',
  platformEvent: 'AddToCart',
  triggerType: 'click',
  selector: '#add-to-cart',
  urlMatchMode: 'exact',
  urlMatch: '/fr/shop/blue-mug/',
}

describe('tracking event request body', () => {
  it('accepts a complete body and stores the rule in canonical form', () => {
    const { def, errors } = readTrackingEventBody(valid)
    expect(errors).toEqual([])
    expect(def.urlMatch).toBe('/shop/blue-mug')
    expect(def.enabled).toBe(true)
  })

  it('applies defaults on a create', () => {
    const { def, errors } = readTrackingEventBody({ name: 'Plain', selector: '#x' })
    expect(errors).toEqual([])
    expect(def.platformEvent).toBe('Custom')
    expect(def.triggerType).toBe('click')
    expect(def.urlMatchMode).toBe('any')
  })

  it('rejects a click without a selector, an unknown standard event and a bad currency', () => {
    expect(readTrackingEventBody({ ...valid, selector: '' }).errors.join(' ')).toMatch(/CSS selector/)
    expect(readTrackingEventBody({ ...valid, platformEvent: 'Nope' }).errors.join(' ')).toMatch(/standard event/)
    expect(readTrackingEventBody({ ...valid, currency: 'dollars' }).errors.join(' ')).toMatch(/Currency/)
  })

  it('rejects a selector that is not a plain CSS selector', () => {
    expect(readTrackingEventBody({ ...valid, selector: 'a{color:red}' }).errors.join(' ')).toMatch(/not valid/)
    expect(readTrackingEventBody({ ...valid, selector: '<script>' }).errors.join(' ')).toMatch(/not valid/)
  })

  it('rejects an unknown trigger and URL match', () => {
    expect(readTrackingEventBody({ ...valid, triggerType: 'hover' }).errors.join(' ')).toMatch(/trigger/i)
    expect(readTrackingEventBody({ ...valid, urlMatchMode: 'regex' }).errors.join(' ')).toMatch(/URL match/)
  })

  it('an edit keeps the stored fields it does not send', () => {
    const stored = { name: 'Old', platformEvent: 'Lead', triggerType: 'submit', selector: 'form.contact', urlMatchMode: 'exact', urlMatch: '/contact', enabled: true }
    const { def, errors } = readTrackingEventBody({ name: 'New name' }, stored as never)
    expect(errors).toEqual([])
    expect(def.name).toBe('New name')
    expect(def.selector).toBe('form.contact')
    expect(def.triggerType).toBe('submit')
    expect(def.urlMatch).toBe('/contact')
  })

  it('rejects a numeric value below zero', () => {
    expect(readTrackingEventBody({ ...valid, value: -3 }).errors.join(' ')).toMatch(/Value/)
  })

  it('summarises a stored row without the internal fields', () => {
    const row = trackingEventSummary({ id: 7, name: 'Buy', platformEvent: 'Purchase', selector: '#buy', urlMatchMode: 'exact', urlMatch: '/shop', secret: 'x' })
    expect(row).toEqual({ id: 7, name: 'Buy', platformEvent: 'Purchase', triggerType: 'click', selector: '#buy', urlMatchMode: 'exact', urlMatch: '/shop', value: null, currency: null, enabled: true })
  })
})
