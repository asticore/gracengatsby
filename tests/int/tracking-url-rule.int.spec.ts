import { describe, expect, it } from 'vitest'

import { urlMatches } from '@/features/tracking/events'
import { normaliseRulePath, pathOnly, rulePathMatches, stripLocalePrefix } from '@/features/tracking/urlRule'

describe('tracking URL rules', () => {
  it('ignores a language prefix', () => {
    expect(stripLocalePrefix('/fr/shop')).toBe('/shop')
    expect(stripLocalePrefix('/zh-Hans/blog/post')).toBe('/blog/post')
    expect(stripLocalePrefix('/fr')).toBe('/')
  })

  it('keeps a path whose first segment is not a language', () => {
    expect(stripLocalePrefix('/faq')).toBe('/faq')
    expect(stripLocalePrefix('/fresh/shop')).toBe('/fresh/shop')
    expect(stripLocalePrefix('/shop/fr')).toBe('/shop/fr')
  })

  it('normalises a page to its rule: no query, hash, language or trailing slash', () => {
    expect(normaliseRulePath('/fr/shop/?utm=1#top')).toBe('/shop')
    expect(normaliseRulePath('https://example.com/de/checkout/')).toBe('/checkout')
    expect(normaliseRulePath('/')).toBe('/')
    expect(normaliseRulePath('/fr/')).toBe('/')
    expect(normaliseRulePath('shop')).toBe('/shop')
  })

  it('reads the path part of a URL', () => {
    expect(pathOnly('https://example.com/a/b?x=1')).toBe('/a/b')
    expect(pathOnly('/a?x#y')).toBe('/a')
    expect(pathOnly('')).toBe('/')
  })

  it('matches a page in any language to the same rule', () => {
    expect(rulePathMatches('/shop', '/fr/shop/')).toBe(true)
    expect(rulePathMatches('/shop', '/shop/item')).toBe(false)
  })

  it('applies exact, starts and contains rules to the page path, ignoring the language', () => {
    expect(urlMatches({ urlMatchMode: 'exact', urlMatch: '/shop' }, '/fr/shop')).toBe(true)
    expect(urlMatches({ urlMatchMode: 'exact', urlMatch: '/shop' }, '/shop/item')).toBe(false)
    expect(urlMatches({ urlMatchMode: 'starts', urlMatch: '/shop' }, '/de/shop/item')).toBe(true)
    expect(urlMatches({ urlMatchMode: 'contains', urlMatch: 'shop' }, '/fr/shop/item')).toBe(true)
    expect(urlMatches({ urlMatchMode: 'any', urlMatch: null }, '/anything')).toBe(true)
    expect(urlMatches({ urlMatchMode: 'exact', urlMatch: '' }, '/shop')).toBe(false)
  })
})
