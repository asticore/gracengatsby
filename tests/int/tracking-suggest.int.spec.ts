import { describe, expect, it } from 'vitest'

import { TAG_OPTIONS, optionForRow, tagOptionDef } from '@/features/tracking/editor/options'
import { suggestEvent } from '@/features/tracking/editor/suggest'
import { STANDARD_EVENTS, validateTrackingEvent } from '@/features/tracking/events'

describe('tag editor suggestions', () => {
  it('suggests Add to cart from button text', () => {
    expect(suggestEvent({ kind: 'button', text: 'Add to cart' })?.option).toBe('addToCart')
    expect(suggestEvent({ kind: 'button', text: '  ADD   TO BAG ' })?.option).toBe('addToCart')
  })

  it('suggests Buy now and Purchase from text', () => {
    expect(suggestEvent({ kind: 'button', text: 'Buy now' })?.option).toBe('buyNow')
    expect(suggestEvent({ kind: 'link', text: 'Purchase', href: '/shop/x' })?.option).toBe('buyNow')
  })

  it('suggests Checkout started from a checkout link', () => {
    expect(suggestEvent({ kind: 'link', text: 'Continue', href: '/checkout?step=2' })).toEqual({ option: 'checkoutStarted', reason: 'href' })
  })

  it('suggests Lead for a form with an email field', () => {
    expect(suggestEvent({ kind: 'form', hasEmailField: true })).toEqual({ option: 'lead', reason: 'form' })
  })

  it('suggests Sign up for a form with a password field, before the email rule', () => {
    expect(suggestEvent({ kind: 'form', hasEmailField: true, hasPasswordField: true })?.option).toBe('signUp')
  })

  it('suggests Search for a search form', () => {
    expect(suggestEvent({ kind: 'form', hasSearchField: true })?.option).toBe('search')
    expect(suggestEvent({ kind: 'form', formAction: '/search?' })?.option).toBe('search')
  })

  it('suggests phone and email from the link scheme', () => {
    expect(suggestEvent({ kind: 'link', text: 'Call us', href: 'tel:+15551234' })?.option).toBe('phone')
    expect(suggestEvent({ kind: 'link', text: 'Write', href: 'mailto:hi@example.com' })?.option).toBe('email')
  })

  it('suggests Download for a file link', () => {
    expect(suggestEvent({ kind: 'link', text: 'Get the guide', href: '/files/guide.pdf' })?.option).toBe('download')
    expect(suggestEvent({ kind: 'link', text: 'Brochure', href: '/brochure', download: true })?.option).toBe('download')
  })

  it('suggests View product for a product link and Book now from text', () => {
    expect(suggestEvent({ kind: 'link', text: 'Blue mug', href: '/shop/blue-mug' })?.option).toBe('viewProduct')
    expect(suggestEvent({ kind: 'button', text: 'Book now' })?.option).toBe('bookNow')
  })

  it('returns null when nothing matches, so the admin picks Custom', () => {
    expect(suggestEvent({ kind: 'button', text: 'Menu' })).toBeNull()
    expect(suggestEvent({ kind: 'other' })).toBeNull()
  })

  it('every option maps to a valid tracking event', () => {
    for (const option of TAG_OPTIONS) {
      expect(STANDARD_EVENTS).toContain(option.platformEvent)
      const errors = validateTrackingEvent({
        name: option.defaultName,
        platformEvent: option.platformEvent,
        triggerType: option.trigger,
        selector: '#buy',
      })
      expect(errors).toEqual([])
    }
    expect(tagOptionDef('custom').platformEvent).toBe('Custom')
  })

  it('recovers the option for a saved row when editing', () => {
    expect(optionForRow('AddToCart', 'Add to cart')).toBe('addToCart')
    expect(optionForRow('Contact', 'Phone click')).toBe('phone')
    expect(optionForRow('Custom', 'Something else')).toBe('custom')
  })
})

describe('tag editor newsletter and cart suggestions', () => {
  it('suggests Newsletter signup for a subscribe form, and not Lead', () => {
    expect(suggestEvent({ kind: 'form', formAction: '/subscribe', hasEmailField: true })?.option).toBe('newsletter')
    expect(suggestEvent({ kind: 'form', text: 'Subscribe to our newsletter', hasEmailField: true })?.option).toBe('newsletter')
  })

  it('suggests View cart for a cart link', () => {
    expect(suggestEvent({ kind: 'link', text: 'Cart', href: '/cart' })?.option).toBe('viewCart')
  })
})
