// @vitest-environment node
/**
 * Hover prefetch (Speed > Advanced > preloadOnHover). The rules are evaluated from the
 * same source string the browser receives, so these cases test the shipped code.
 */
import { describe, expect, it } from 'vitest'

import { runtimeConfigFor, buildRuntimeScript } from '@/features/speed/runtime'
import { PREFETCH_EXCLUDED_PATHS, PREFETCH_HOVER_DELAY_MS, PREFETCH_MAX_PER_PAGE, PREFETCH_RULES_SOURCE } from '@/features/speed/prefetchRules'
import { DISABLED_SPEED, resolveSpeed, type ResolvedSpeed } from '@/features/speed/types'

type Rules = {
  eligible: (a: { href: string; target?: string; download?: boolean }, here: string, excluded: readonly string[]) => boolean
  connectionOk: (conn: { saveData?: boolean; effectiveType?: string } | null) => boolean
}

const rules = new Function(`return ${PREFETCH_RULES_SOURCE}`)() as Rules
const HERE = 'https://shop.example.com/collections/rings'
const ok = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) =>
  rules.eligible({ href, ...extra }, HERE, PREFETCH_EXCLUDED_PATHS)

describe('hover prefetch: link eligibility', () => {
  it('accepts a plain same-site page', () => {
    expect(ok('https://shop.example.com/collections/necklaces')).toBe(true)
  })

  it('accepts a relative path, which the browser has already made absolute', () => {
    expect(ok('/products/gold-hoop')).toBe(true)
  })

  it('accepts a link with a query string', () => {
    expect(ok('https://shop.example.com/search?q=gold')).toBe(true)
  })

  it('accepts http on the same origin', () => {
    expect(rules.eligible({ href: 'http://shop.example.com/about' }, 'http://shop.example.com/', [])).toBe(true)
  })

  it('refuses a different origin', () => {
    expect(ok('https://other.example.org/page')).toBe(false)
  })

  it('refuses a different port, which is a different origin', () => {
    expect(ok('https://shop.example.com:8443/page')).toBe(false)
  })

  it('refuses a subdomain, which is a different origin', () => {
    expect(ok('https://blog.shop.example.com/post')).toBe(false)
  })

  it('refuses a same-origin link that opens in a new tab', () => {
    expect(ok('https://shop.example.com/about', { target: '_blank' })).toBe(false)
  })

  it('allows an explicit _self target', () => {
    expect(ok('https://shop.example.com/about', { target: '_self' })).toBe(true)
  })

  it('refuses a download link', () => {
    expect(ok('https://shop.example.com/catalogue.pdf', { download: true })).toBe(false)
  })

  it('refuses mailto, tel and javascript links', () => {
    expect(ok('mailto:hello@example.com')).toBe(false)
    expect(ok('tel:+441234567890')).toBe(false)
    expect(ok('javascript:void(0)')).toBe(false)
  })

  it('refuses the admin, api, cart and checkout paths', () => {
    expect(ok('/admin')).toBe(false)
    expect(ok('/admin/collections/pages')).toBe(false)
    expect(ok('/api/forms/3/submit')).toBe(false)
    expect(ok('/cart')).toBe(false)
    expect(ok('/checkout/confirm')).toBe(false)
  })

  it('does not confuse a look-alike path with an excluded one', () => {
    expect(ok('/administrators')).toBe(true)
    expect(ok('/apiary-notes')).toBe(true)
    expect(ok('/cartier')).toBe(true)
    expect(ok('/checkout-guide')).toBe(true)
  })

  it('refuses the page the visitor is already on, including with a hash', () => {
    expect(ok('https://shop.example.com/collections/rings')).toBe(false)
    expect(ok('/collections/rings#reviews')).toBe(false)
  })

  it('allows the same path with a different query string', () => {
    expect(ok('https://shop.example.com/collections/rings?sort=price')).toBe(true)
  })

  it('refuses an empty href', () => {
    expect(rules.eligible({ href: '' }, HERE, [])).toBe(false)
  })

  it('refuses a missing link object', () => {
    expect(rules.eligible(null as unknown as { href: string }, HERE, [])).toBe(false)
  })

  it('does not throw on a malformed base or href', () => {
    expect(rules.eligible({ href: 'http://[bad' }, HERE, [])).toBe(false)
    expect(rules.eligible({ href: '/ok' }, 'not a url', [])).toBe(false)
  })

  it('honours a custom exclusion list', () => {
    expect(rules.eligible({ href: 'https://shop.example.com/private/x' }, HERE, ['/private'])).toBe(false)
  })
})

describe('hover prefetch: connection', () => {
  it('allows when the browser does not report a connection', () => {
    expect(rules.connectionOk(null)).toBe(true)
  })

  it('allows a fast connection', () => {
    expect(rules.connectionOk({ effectiveType: '4g', saveData: false })).toBe(true)
  })

  it('refuses when data-saver is on', () => {
    expect(rules.connectionOk({ effectiveType: '4g', saveData: true })).toBe(false)
  })

  it('refuses 2g and slow-2g', () => {
    expect(rules.connectionOk({ effectiveType: '2g' })).toBe(false)
    expect(rules.connectionOk({ effectiveType: 'slow-2g' })).toBe(false)
  })

  it('allows 3g', () => {
    expect(rules.connectionOk({ effectiveType: '3g' })).toBe(true)
  })
})

describe('hover prefetch: limits and wiring', () => {
  it('uses the agreed hover delay and per-page cap', () => {
    expect(PREFETCH_HOVER_DELAY_MS).toBe(65)
    expect(PREFETCH_MAX_PER_PAGE).toBe(20)
  })

  it('is on by default in the resolved settings', () => {
    expect(resolveSpeed({ advanced: {} } as never, true).advanced.preloadOnHover).toBe(true)
  })

  it('stays off when the setting is explicitly off', () => {
    expect(resolveSpeed({ advanced: { preloadOnHover: false } } as never, true).advanced.preloadOnHover).toBe(false)
  })

  it('is off when the feature is disabled', () => {
    expect(DISABLED_SPEED.advanced.preloadOnHover).toBe(false)
  })

  it('on its own, produces a runtime config and an inline script', () => {
    const speed: ResolvedSpeed = resolveSpeed(
      {
        media: { lazyLoadImages: false, lazyLoadIframes: false, addImageDimensions: false },
        advanced: { preloadOnHover: true, delayJsExecution: false },
      } as never,
      true,
    )
    const config = runtimeConfigFor(speed)
    expect(config).not.toBeNull()
    expect(config?.preloadOnHover).toBe(true)
    const script = buildRuntimeScript(config!)
    expect(script).toContain("l.rel='prefetch'")
    expect(script).toContain('pointerover')
    expect(script).toContain('"/admin"')
    expect(script).not.toMatch(/[^\x00-\x7f]/)
  })

  it('emits nothing when every runtime switch is off', () => {
    const speed = resolveSpeed(
      {
        media: { lazyLoadImages: false, lazyLoadIframes: false, addImageDimensions: false },
        advanced: { preloadOnHover: false, delayJsExecution: false },
      } as never,
      true,
    )
    expect(runtimeConfigFor(speed)).toBeNull()
  })
})
