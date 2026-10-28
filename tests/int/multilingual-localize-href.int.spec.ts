import { describe, expect, it, vi } from 'vitest'

// Outside a React request, cache() gives a fresh object per call. Here one holder stands in for one request.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: <F extends (...args: never[]) => unknown>(fn: F) => { let value: unknown; let set = false; return ((...args: never[]) => { if (!set) { value = fn(...args); set = true } return value }) as F } }
})

import { localizeHref } from '@/features/multilingual/localizeHref'
import { localizeBlockLinks, setRequestLinkLocale, localizeForRequest } from '@/features/multilingual/requestLinkLocale'
import type { MultilingualSettings } from '@/features/multilingual/settings'

const on: MultilingualSettings = {
  enabled: true,
  defaultLocale: 'en',
  activeLocales: ['en', 'fr'],
  fallbackToDefault: true,
  machine: { enabled: false, defaultProvider: null, overrides: {}, monthlyCharLimit: 0, autoDraft: false },
  showLanguageSwitcher: true,
  switcherPosition: 'header',
  requireReview: false,
  adminsBypassReview: true,
  translationRules: {},
}
const off: MultilingualSettings = { ...on, enabled: false }

describe('localizeHref', () => {
  it('prefixes internal pages for a non-default locale', () => {
    expect(localizeHref('/about', 'fr', on)).toBe('/fr/about')
    expect(localizeHref('/', 'fr', on)).toBe('/fr')
    expect(localizeHref('/shop/blue-mug/', 'fr', on)).toBe('/fr/shop/blue-mug')
    expect(localizeHref('/shop?sort=price#top', 'fr', on)).toBe('/fr/shop?sort=price#top')
  })

  it('leaves the default locale unprefixed', () => {
    expect(localizeHref('/about', 'en', on)).toBe('/about')
  })

  it('leaves external, scheme, anchor and relative links alone', () => {
    for (const href of ['https://example.com/x', '//cdn.example.com/a', 'mailto:a@b.co', 'tel:+123', '#faq', '?page=2', 'contact', '']) {
      expect(localizeHref(href, 'fr', on)).toBe(href)
    }
  })

  it('leaves the app paths and file URLs alone', () => {
    for (const href of ['/admin', '/admin/pages', '/api/x', '/account', '/account/orders', '/preview/pages/1', '/_next/static/a.js', '/brochure.pdf', '/media/logo.png']) {
      expect(localizeHref(href, 'fr', on)).toBe(href)
    }
  })

  it('never double-prefixes', () => {
    expect(localizeHref('/fr/about', 'fr', on)).toBe('/fr/about')
    expect(localizeHref('/FR/about', 'fr', on)).toBe('/FR/about')
    expect(localizeHref(localizeHref('/about', 'fr', on), 'fr', on)).toBe('/fr/about')
  })

  it('is identity when multilingual is off or there is one language', () => {
    expect(localizeHref('/about', 'fr', off)).toBe('/about')
    expect(localizeHref('/about', 'fr', { ...on, activeLocales: ['en'] })).toBe('/about')
    expect(localizeHref('/about', 'de', on)).toBe('/about')
  })
})

describe('request-scoped link locale', () => {
  it('rewrites hrefs and block link fields only while a non-default locale is set', () => {
    setRequestLinkLocale(null, null)
    expect(localizeForRequest('/about')).toBe('/about')

    setRequestLinkLocale('fr', on)
    expect(localizeForRequest('/about')).toBe('/fr/about')
    const block = { heading: 'Hi', primaryCtaUrl: '/shop', secondaryCtaUrl: 'https://x.test', imageUrl: '/a.png', n: 3 }
    const out = localizeBlockLinks(block)
    expect(out).toEqual({ heading: 'Hi', primaryCtaUrl: '/fr/shop', secondaryCtaUrl: 'https://x.test', imageUrl: '/a.png', n: 3 })
    expect(block.primaryCtaUrl).toBe('/shop')

    setRequestLinkLocale('en', on)
    expect(localizeBlockLinks(block)).toBe(block)
    setRequestLinkLocale(null, null)
  })
})
